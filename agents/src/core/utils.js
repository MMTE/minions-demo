export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 30);
}

export function extractIssueNumber(text) {
  const match = text.match(/#(\d+)/);
  return match ? parseInt(match[1]) : null;
}

export function extractLinkedIssues(prBody) {
  const patterns = [
    /closes?\s+#(\d+)/gi,
    /fixes?\s+#(\d+)/gi,
    /resolves?\s+#(\d+)/gi,
  ];
  
  const issues = new Set();
  for (const pattern of patterns) {
    const matches = prBody.matchAll(pattern);
    for (const match of matches) {
      issues.add(parseInt(match[1]));
    }
  }
  
  return Array.from(issues);
}

export function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

export function formatFileTree(files) {
  const tree = {};
  for (const file of files) {
    const parts = file.split('/');
    let current = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = null;
  }
  
  function render(node, prefix = '') {
    const entries = Object.entries(node);
    return entries.map(([name, children], i) => {
      const isLast = i === entries.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const childPrefix = isLast ? '    ' : '│   ';
      
      if (children === null) {
        return prefix + connector + name;
      }
      return prefix + connector + name + '/\n' + render(children, prefix + childPrefix);
    }).join('\n');
  }
  
  return render(tree);
}
