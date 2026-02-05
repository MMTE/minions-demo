import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';

const ThrottledOctokit = Octokit.plugin(throttling);

export class GitHubClient {
  constructor(token, repository) {
    this.octokit = new ThrottledOctokit({
      auth: token,
      throttle: {
        onRateLimit: (retryAfter, options, octokit, retryCount) => {
          console.warn(`Rate limit hit, retrying after ${retryAfter}s (attempt ${retryCount + 1})`);
          if (retryCount < 2) return true;
        },
        onSecondaryRateLimit: (retryAfter, options, octokit) => {
          console.warn(`Secondary rate limit hit, retrying after ${retryAfter}s`);
          return true;
        },
      },
    });
    const [owner, repo] = repository.split('/');
    this.owner = owner;
    this.repo = repo;
  }

  async checkRateLimit() {
    const { data } = await this.octokit.rateLimit.get();
    const remaining = data.resources.core.remaining;
    const resetAt = new Date(data.resources.core.reset * 1000);

    console.log(`GitHub API: ${remaining} requests remaining, resets at ${resetAt.toISOString()}`);

    if (remaining < 100) {
      console.warn('Low rate limit remaining!');
    }

    return { remaining, resetAt };
  }

  async getIssue(issueNumber) {
    const { data } = await this.octokit.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
    });
    return data;
  }

  async getIssueComments(issueNumber) {
    const { data } = await this.octokit.issues.listComments({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
    });
    return data;
  }

  async createIssue(title, body, labels = [], milestone = null) {
    const { data } = await this.octokit.issues.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body,
      labels,
      milestone,
    });
    return data;
  }

  async createComment(issueNumber, body) {
    const { data } = await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body,
    });
    return data;
  }

  async addLabels(issueNumber, labels) {
    await this.octokit.issues.addLabels({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      labels,
    });
  }

  async removeLabel(issueNumber, label) {
    try {
      await this.octokit.issues.removeLabel({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        name: label,
      });
    } catch (error) {
      // Label might not exist, ignore
    }
  }

  async getOpenIssues() {
    const { data } = await this.octokit.issues.listForRepo({
      owner: this.owner,
      repo: this.repo,
      state: 'open',
      per_page: 50,
    });
    return data.filter(issue => !issue.pull_request);
  }

  async getPullRequest(prNumber) {
    const { data } = await this.octokit.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
    });
    return data;
  }

  async getPullRequestFiles(prNumber) {
    const { data } = await this.octokit.pulls.listFiles({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
    });
    return data;
  }

  async createPullRequest(title, body, head, base = 'main') {
    const { data } = await this.octokit.pulls.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body,
      head,
      base,
    });
    return data;
  }

  async createPullRequestReview(prNumber, body, event = 'COMMENT') {
    const { data } = await this.octokit.pulls.createReview({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      body,
      event,
    });
    return data;
  }

  async getRecentPullRequests(count = 10) {
    const { data } = await this.octokit.pulls.list({
      owner: this.owner,
      repo: this.repo,
      state: 'all',
      per_page: count,
      sort: 'updated',
      direction: 'desc',
    });
    return data;
  }

  async getFileContent(path, ref = 'main') {
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref,
      });
      return Buffer.from(data.content, 'base64').toString('utf-8');
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }

  async getRepositoryTree(ref = 'main') {
    const { data } = await this.octokit.git.getTree({
      owner: this.owner,
      repo: this.repo,
      tree_sha: ref,
      recursive: 'true',
    });
    return data.tree
      .filter(item => item.type === 'blob')
      .map(item => item.path);
  }

  async createBranch(branchName, fromRef = 'main') {
    const { data: refData } = await this.octokit.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${fromRef}`,
    });

    await this.octokit.git.createRef({
      owner: this.owner,
      repo: this.repo,
      ref: `refs/heads/${branchName}`,
      sha: refData.object.sha,
    });
  }

  async createOrUpdateFile(path, content, message, branch) {
    let sha = null;

    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref: branch,
      });
      sha = data.sha;
    } catch (error) {
      // File doesn't exist, will create
    }

    const params = {
      owner: this.owner,
      repo: this.repo,
      path,
      message,
      content: Buffer.from(content).toString('base64'),
      branch,
    };

    if (sha) params.sha = sha;

    await this.octokit.repos.createOrUpdateFileContents(params);
  }

  async getRecentCommits(count = 10) {
    const { data } = await this.octokit.repos.listCommits({
      owner: this.owner,
      repo: this.repo,
      per_page: count,
    });
    return data.map(commit => ({
      sha: commit.sha.substring(0, 7),
      message: commit.commit.message,
      author: commit.commit.author.name,
      date: commit.commit.author.date,
    }));
  }

  async getDiscussion(discussionNumber) {
    const query = `
      query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          discussion(number: $number) {
            id
            title
            body
            author { login }
            comments(first: 50) {
              nodes {
                id
                body
                author { login }
                createdAt
              }
            }
          }
        }
      }
    `;

    const { repository } = await this.octokit.graphql(query, {
      owner: this.owner,
      repo: this.repo,
      number: discussionNumber,
    });

    return repository.discussion;
  }

  async createDiscussionComment(discussionId, body) {
    const mutation = `
      mutation($discussionId: ID!, $body: String!) {
        addDiscussionComment(input: { discussionId: $discussionId, body: $body }) {
          comment {
            id
          }
        }
      }
    `;

    await this.octokit.graphql(mutation, {
      discussionId,
      body,
    });
  }

  async createMilestone(title, description = '') {
    const { data } = await this.octokit.issues.createMilestone({
      owner: this.owner,
      repo: this.repo,
      title,
      description,
    });
    return data;
  }

  async listMilestones() {
    const { data } = await this.octokit.issues.listMilestones({
      owner: this.owner,
      repo: this.repo,
      state: 'open',
    });
    return data;
  }
}

export function createGitHubClient() {
  return new GitHubClient(
    process.env.GITHUB_TOKEN,
    process.env.GITHUB_REPOSITORY
  );
}
