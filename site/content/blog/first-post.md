+++
title = "Building a Retro-Styled Website with Hugo"
date = 2026-06-20
description = "Creating a simple, retro-themed personal site"
categories = ["web development", "hugo"]
tags = ["hugo", "css", "design", "retro"]
+++

## Introduction

I recently rebuilt my personal website with a retro aesthetic inspired by German Expressionist cinema. Specifically, I drew inspiration from Fritz Lang's *Die Nibelungen: Siegfried* (1924) and Benjamin Christensen's *Häxan* (1922).

## The Design Philosophy

German Expressionist films are known for:

- **High contrast**: Deep blacks and bright highlights
- **Dramatic lighting**: Shadows and light creating depth
- **Minimalist sets**: Simple but striking environments
- **Symbolic colors**: Gold for treasure/nobility, dark reds for danger

I wanted to capture this feeling in a website design:

- **Dark background** (#0a0a0a) - like the shadows in the films
- **Cream text** (#f5f5dc) - like old parchment or film subtitles
- **Gold accents** (#d4af37) - for highlights and important elements
- **Rust/brown** (#8b4513) - for secondary elements and borders

## Implementation

The site uses:

- **Hugo** for static site generation
- **Pure CSS** with CSS variables for the color scheme
- **Simple HTML templates** with minimal JavaScript

Here's a sample of the CSS:

```css
:root {
  --bg-dark: #0a0a0a;
  --text-primary: #f5f5dc;
  --accent-gold: #d4af37;
  --accent-rust: #8b4513;
}

body {
  background: var(--bg-dark);
  color: var(--text-primary);
  font-family: Georgia, serif;
}

a {
  color: var(--accent-gold);
}
```

## Why This Aesthetic?

Technical content doesn't have to look sterile and modern. A retro design:

1. **Reduces eye strain** with dark backgrounds
2. **Feels timeless** rather than tied to current trends
3. **Creates atmosphere** that makes reading more enjoyable
4. **Shows personality** - it's not just another generic tech blog

Plus, it's a nice homage to the history of visual storytelling.

## Conclusion

Building this site was an exercise in simplicity and aesthetic focus. By limiting the color palette and using classic typography, I created something that feels both old and new at the same time.

The code is all available in the site's repository, so you can see exactly how it's put together.
