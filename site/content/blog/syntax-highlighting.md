+++
title = "Syntax Highlighting with Simple CSS"
date = 2026-06-18
description = "Adding basic syntax highlighting without external libraries"
categories = ["web development", "css"]
tags = ["css", "syntax highlighting", "javascript"]
+++

## Introduction

You don't need a heavy library to add basic syntax highlighting to your code blocks. With a few lines of CSS and some simple JavaScript, you can create a lightweight solution that works for your needs.

## The CSS Approach

Here's a simple way to highlight code using CSS classes:

```css
/* Syntax Highlighting */
pre code .keyword {
  color: #d4af37;
  font-weight: bold;
}

pre code .literal {
  color: #e8a862;
}

pre code .number {
  color: #c08040;
}

pre code .comment {
  color: #a0a0a0;
  font-style: italic;
}

pre code .string {
  color: #a0d080;
}
```

## The JavaScript Pattern Matcher

Here's a simple function that adds classes to code elements:

```javascript
function applySyntaxHighlighting() {
  const codeBlocks = document.querySelectorAll('pre code');

  codeBlocks.forEach(block => {
    const text = block.textContent;

    // Replace keywords
    let highlighted = text.replace(
      /\b(function|const|let|var|return|if|else|for|while|switch|case|break|continue)\b/g,
      '<span class="keyword">$1</span>'
    );

    // Replace literals
    highlighted = highlighted.replace(
      /\b(null|undefined|true|false|NaN)\b/g,
      '<span class="literal">$1</span>'
    );

    // Replace numbers
    highlighted = highlighted.replace(
      /\b(\d+(\.\d+)?)\b/g,
      '<span class="number">$1</span>'
    );

    // Replace comments
    highlighted = highlighted.replace(
      /(\/\/.*$)/gm,
      '<span class="comment">$1</span>'
    );

    // Replace strings
    highlighted = highlighted.replace(
      /(".*?"|'.*?')/g,
      '<span class="string">$1</span>'
    );

    block.innerHTML = highlighted;
  });
}

// Apply on page load
document.addEventListener('DOMContentLoaded', applySyntaxHighlighting);
```

## Example in Action

Here's what it looks like with the highlighting applied:

```javascript
// Calculate factorial using recursion
function factorial(n) {
  if (n <= 1) {
    return 1;
  }
  return n * factorial(n - 1);
}

// Usage
const result = factorial(5);
console.log(result); // Output: 120
```

## Language-Specific Classes

You can also add language-specific styling by detecting the file type:

```javascript
function highlightByLanguage(block, language) {
  switch (language) {
    case 'javascript':
      block.classList.add('lang-js');
      break;
    case 'python':
      block.classList.add('lang-py');
      break;
    case 'html':
      block.classList.add('lang-html');
      break;
    case 'css':
      block.classList.add('lang-css');
      break;
    default:
      block.classList.add('lang-other');
  }
}
```

## Benefits of This Approach

1. **No external dependencies** - Works with pure HTML/CSS/JS
2. **Fast** - No heavy parsing or highlighting libraries
3. **Customizable** - Easily change colors and styles
4. **Lightweight** - Minimal impact on page load

## Limitations

This simple approach has some limitations:

- Doesn't handle nested structures (like strings inside strings)
- Limited to the patterns you define
- Doesn't handle multi-line comments in all cases
- Less sophisticated than dedicated highlighting libraries

For most personal sites and blogs, though, it's more than enough.

## Conclusion

For a simple blog or personal site, a lightweight syntax highlighting solution like this can be a great choice. It's fast, easy to maintain, and gives you full control over the appearance.

If you need more sophisticated highlighting, consider using libraries like:
- Prism.js
- Highlight.js
- Shiki
- Monaco Editor

But for most use cases, the simple approach works just fine.
