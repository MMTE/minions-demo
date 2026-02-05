import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export function validateCode(code, filename) {
  const ext = filename.split('.').pop()?.toLowerCase();

  if (['js', 'mjs', 'cjs'].includes(ext)) {
    return validateJavaScript(code);
  }

  if (ext === 'ts') {
    return validateTypeScript(code, false);
  }

  if (ext === 'tsx') {
    return validateTypeScript(code, true);
  }

  if (['jsx'].includes(ext)) {
    return validateJSX(code);
  }

  if (ext === 'py') {
    return validatePython(code);
  }

  if (ext === 'json') {
    return validateJSON(code);
  }

  return { valid: true, errors: [] };
}

function validateJavaScript(code) {
  try {
    new Function(code);
    return { valid: true, errors: [] };
  } catch (error) {
    return {
      valid: false,
      errors: [error.message],
    };
  }
}

function validateTypeScript(code, isTsx = false) {
  const ext = isTsx ? 'tsx' : 'ts';
  const tempFile = join(tmpdir(), `validate_${Date.now()}.${ext}`);
  try {
    writeFileSync(tempFile, code);
    const jsxFlag = isTsx ? '--jsx react' : '';
    execSync(`npx tsc --noEmit --allowJs --skipLibCheck ${jsxFlag} "${tempFile}"`, {
      stdio: 'pipe',
      timeout: 15000,
    });
    return { valid: true, errors: [] };
  } catch (error) {
    const stderr = error.stderr?.toString() || error.message;
    const errors = stderr
      .split('\n')
      .filter(line => line.includes('error'))
      .slice(0, 5);
    return {
      valid: false,
      errors: errors.length > 0 ? errors : [stderr.slice(0, 500)],
    };
  } finally {
    try {
      unlinkSync(tempFile);
    } catch {}
  }
}

function validateJSX(code) {
  const wrappedCode = `
    const React = { createElement: () => {} };
    ${code}
  `;
  try {
    new Function(wrappedCode);
    return { valid: true, errors: [] };
  } catch (error) {
    return {
      valid: false,
      errors: [error.message],
    };
  }
}

function validatePython(code) {
  const tempFile = join(tmpdir(), `validate_${Date.now()}.py`);
  try {
    writeFileSync(tempFile, code);
    execSync(`python3 -m py_compile "${tempFile}"`, {
      stdio: 'pipe',
      timeout: 5000,
    });
    return { valid: true, errors: [] };
  } catch (error) {
    return {
      valid: false,
      errors: [error.stderr?.toString() || error.message],
    };
  } finally {
    try {
      unlinkSync(tempFile);
    } catch {}
  }
}

function validateJSON(code) {
  try {
    JSON.parse(code);
    return { valid: true, errors: [] };
  } catch (error) {
    return {
      valid: false,
      errors: [error.message],
    };
  }
}

export function validateAllFiles(files) {
  const results = {
    valid: true,
    fileErrors: {},
  };

  for (const file of files) {
    const validation = validateCode(file.content, file.path);
    if (!validation.valid) {
      results.valid = false;
      results.fileErrors[file.path] = validation.errors;
    }
  }

  return results;
}
