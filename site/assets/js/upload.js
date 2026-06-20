// Code Upload Handler - Simple client-side functionality
// Works with a server endpoint or local storage

document.addEventListener('DOMContentLoaded', function() {
  const uploadForm = document.getElementById('code-upload-form');
  const uploadStatus = document.getElementById('upload-status');
  const codePreview = document.getElementById('code-preview');
  const fileInput = document.getElementById('code-file');

  if (uploadForm) {
    uploadForm.addEventListener('submit', handleUpload);
  }

  if (fileInput) {
    fileInput.addEventListener('change', previewCode);
  }
});

function previewCode(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    if (codePreview) {
      codePreview.textContent = e.target.result;
      codePreview.style.display = 'block';

      // Add syntax highlighting based on file type
      const fileName = file.name.toLowerCase();
      if (fileName.endsWith('.js')) {
        codePreview.classList.add('lang-js');
      } else if (fileName.endsWith('.py')) {
        codePreview.classList.add('lang-py');
      } else if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
        codePreview.classList.add('lang-html');
      } else if (fileName.endsWith('.css')) {
        codePreview.classList.add('lang-css');
      }
    }
  };
  reader.readAsText(file);
}

function handleUpload(event) {
  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;

  // Show loading state
  submitBtn.disabled = true;
  submitBtn.textContent = 'Uploading...';

  if (uploadStatus) {
    uploadStatus.textContent = '';
    uploadStatus.className = 'status';
  }

  // For demo purposes, simulate upload
  // In production, replace with actual fetch to your endpoint
  simulateUpload(formData)
    .then(response => {
      if (uploadStatus) {
        uploadStatus.textContent = 'Upload successful!';
        uploadStatus.className = 'status success';

        // Reset form
        form.reset();
        if (codePreview) {
          codePreview.textContent = '';
          codePreview.style.display = 'none';
          codePreview.className = '';
        }
      }
    })
    .catch(error => {
      if (uploadStatus) {
        uploadStatus.textContent = 'Upload failed: ' + error.message;
        uploadStatus.className = 'status error';
      }
    })
    .finally(() => {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    });
}

function simulateUpload(formData) {
  return new Promise((resolve, reject) => {
    // Simulate network delay
    setTimeout(() => {
      // Get values
      const title = formData.get('title');
      const description = formData.get('description');
      const file = formData.get('code-file');
      const category = formData.get('category');

      if (!title || !file) {
        reject(new Error('Title and file are required'));
        return;
      }

      // Create a simple upload object (in real use, send to server)
      const upload = {
        id: Date.now().toString(),
        title,
        description,
        category,
        filename: file.name,
        size: file.size,
        type: file.type || 'text/plain',
        timestamp: new Date().toISOString()
      };

      // Save to local storage for demo
      saveToLocalStorage(upload);

      resolve(upload);
    }, 1000);
  });
}

function saveToLocalStorage(upload) {
  try {
    let uploads = JSON.parse(localStorage.getItem('code-uploads') || '[]');
    uploads.push(upload);
    localStorage.setItem('code-uploads', JSON.stringify(uploads));

    // Update the uploads list on the page
    updateUploadsList();
  } catch (e) {
    console.error('Could not save to localStorage:', e);
  }
}

function loadFromLocalStorage() {
  try {
    return JSON.parse(localStorage.getItem('code-uploads') || '[]');
  } catch (e) {
    return [];
  }
}

function updateUploadsList() {
  const uploads = loadFromLocalStorage();
  const listElement = document.getElementById('recent-uploads');

  if (!listElement) return;

  listElement.innerHTML = '<h3>Recent Uploads</h3>';

  if (uploads.length === 0) {
    listElement.innerHTML += '<p>No uploads yet.</p>';
    return;
  }

  const list = document.createElement('ul');
  uploads.slice(-5).reverse().forEach(upload => {
    const item = document.createElement('li');
    const date = new Date(upload.timestamp);
    item.innerHTML = `
      <strong>${upload.title}</strong> - ${upload.filename}
      <span style="color: var(--accent-rust); font-size: 0.8rem;">
        (${date.toLocaleDateString()})
      </span>
      <p style="font-size: 0.9rem; color: var(--text-secondary);">
        ${upload.description || 'No description'}
      </p>
    `;
    list.appendChild(item);
  });

  listElement.appendChild(list);
}

// Initialize uploads list on page load
document.addEventListener('DOMContentLoaded', updateUploadsList);

// Syntax highlighting (simple version)
function applySyntaxHighlighting() {
  const codeBlocks = document.querySelectorAll('pre code');
  codeBlocks.forEach(block => {
    const text = block.textContent;
    // Simple highlighting - replace with actual highlighter if needed
    const highlighted = text
      .replace(/\b(function|const|let|var|return|if|else|for|while)\b/g, '<span class="keyword">$1</span>')
      .replace(/\b(null|undefined|true|false)\b/g, '<span class="literal">$1</span>')
      .replace(/\b(\d+)\b/g, '<span class="number">$1</span>')
      .replace(/(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, '<span class="comment">$1</span>');

    block.innerHTML = highlighted;
  });
}

// Apply highlighting when DOM is ready
document.addEventListener('DOMContentLoaded', applySyntaxHighlighting);
