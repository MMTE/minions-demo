export class ProjectMemory {
  constructor(github) {
    this.github = github;
    this.basePath = 'memory';
  }

  async getProjectContext() {
    return await this.github.getFileContent(`${this.basePath}/project_context.md`);
  }

  async getConventions() {
    return await this.github.getFileContent(`${this.basePath}/conventions.md`);
  }

  async getDecisions() {
    return await this.github.getFileContent(`${this.basePath}/decisions.md`);
  }

  async getAllContext() {
    const [project, conventions, decisions] = await Promise.all([
      this.getProjectContext(),
      this.getConventions(),
      this.getDecisions(),
    ]);

    return {
      project: project || 'No project context documented yet.',
      conventions: conventions || 'No conventions documented yet.',
      decisions: decisions || 'No decisions documented yet.',
    };
  }

  async updateProjectContext(content, message = 'Update project context') {
    await this.github.createOrUpdateFile(
      `${this.basePath}/project_context.md`,
      content,
      `memory: ${message}`,
      'main'
    );
  }

  async addConvention(convention) {
    let current = await this.getConventions() || '# Coding Conventions\n\n';
    current += `\n- ${convention}`;
    
    await this.github.createOrUpdateFile(
      `${this.basePath}/conventions.md`,
      current,
      `memory: Add convention`,
      'main'
    );
  }

  async addDecision(title, context, decision, alternatives = []) {
    const date = new Date().toISOString().split('T')[0];
    const adr = `
## ${title}

**Date:** ${date}

### Context
${context}

### Decision
${decision}

### Alternatives Considered
${alternatives.map(a => `- ${a}`).join('\n') || 'None documented.'}

---
`;

    let current = await this.getDecisions() || '# Architecture Decision Records\n';
    current += adr;

    await this.github.createOrUpdateFile(
      `${this.basePath}/decisions.md`,
      current,
      `memory: ADR - ${title}`,
      'main'
    );
  }
}

export function createMemory(github) {
  return new ProjectMemory(github);
}
