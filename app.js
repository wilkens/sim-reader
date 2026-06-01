/**
 * THE SIM READER - APPLICATION LOGIC
 * Implements state management, stream fetching, parsing, navigation, typography modifiers,
 * and high-fidelity metadata visualizations for literary browsing.
 */

// --------------------------------------------------------------------------
// 1. Application State
// --------------------------------------------------------------------------
const state = {
    genre: 'my', // Current active genre: 'my' (Mystery) | 'sf' (Sci-Fi) | 'pw' (Literary Fiction)
    stories: [],
    promptsMap: new Map(), // Maps custom_id -> User input prompt
    currentIndex: 0,
    theme: 'dark', // 'dark' | 'light'
    fontFamily: 'serif', // 'serif' | 'sans'
    fontSize: 'md', // 'sm' | 'md' | 'lg'
};

const GENRES = {
    my: {
        name: "Mystery Collection",
        badge: "GPT-5 Mystery Collection",
        generations: "https://raw.githubusercontent.com/wilkens/literary-generation/refs/heads/main/generations/complex/chapters_complex_my.json",
        prompts: "https://raw.githubusercontent.com/wilkens/literary-generation/refs/heads/main/prompts/complex/chapters_prompts_my.jsonl"
    },
    sf: {
        name: "Sci-Fi Collection",
        badge: "GPT-5 Sci-Fi Collection",
        generations: "https://raw.githubusercontent.com/wilkens/literary-generation/refs/heads/main/generations/complex/chapters_complex_sf.json",
        prompts: "https://raw.githubusercontent.com/wilkens/literary-generation/refs/heads/main/prompts/complex/chapters_prompts_sf.jsonl"
    },
    pw: {
        name: "Literary Collection",
        badge: "GPT-5 Literary Collection",
        generations: "https://raw.githubusercontent.com/wilkens/literary-generation/refs/heads/main/generations/complex/chapters_complex_pw.json",
        prompts: "https://raw.githubusercontent.com/wilkens/literary-generation/refs/heads/main/prompts/complex/chapters_prompts_pw.jsonl"
    }
};

// --------------------------------------------------------------------------
// 2. DOM Elements Cache
// --------------------------------------------------------------------------
const DOM = {
    // Loading Screen
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingBar: document.getElementById('loading-bar'),
    loadingStatus: document.getElementById('loading-status'),
    
    // Main Viewport
    storyArticle: document.getElementById('story-article'),
    
    // Header Controls
    btnGenreSelect: document.getElementById('genre-select'),
    btnThemeToggle: document.getElementById('btn-theme-toggle'),
    btnFontToggle: document.getElementById('btn-font-toggle'),
    btnSizeSm: document.getElementById('btn-size-sm'),
    btnSizeMd: document.getElementById('btn-size-md'),
    btnSizeLg: document.getElementById('btn-size-lg'),
    btnMetadataToggle: document.getElementById('btn-metadata-toggle'),
    
    // Navigation Footer
    btnPrev: document.getElementById('btn-prev'),
    btnNext: document.getElementById('btn-next'),
    btnRandom: document.getElementById('btn-random'),
    btnJump: document.getElementById('btn-jump'),
    storyIndexInput: document.getElementById('story-index-input'),
    spanTotalCount: document.getElementById('span-total-count'),
    
    // Metadata Drawer
    metadataDrawer: document.getElementById('metadata-drawer'),
    btnCloseDrawer: document.getElementById('btn-close-drawer'),
    drawerBackdrop: document.getElementById('drawer-backdrop'),
    metaModel: document.getElementById('meta-model'),
    metaDate: document.getElementById('meta-date'),
    metaUserPrompt: document.getElementById('meta-user-prompt'),
    btnCopyUserPrompt: document.getElementById('btn-copy-user-prompt'),
    metaSystemPrompt: document.getElementById('meta-system-prompt'),
    btnCopySystemPrompt: document.getElementById('btn-copy-system-prompt'),
    
    // Token Charts
    tokenTotal: document.getElementById('token-total'),
    tokenInput: document.getElementById('token-input'),
    tokenOutput: document.getElementById('token-output'),
    tokenReasoning: document.getElementById('token-reasoning'),
    barInput: document.getElementById('bar-input'),
    barOutput: document.getElementById('bar-output'),
    barReasoning: document.getElementById('bar-reasoning'),
    
    // Toast Alert
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message'),
};

// Mystery Quotes for Loading Splash Screen
const LOAD_QUOTES = [
    "\"The first thing I noticed wasn’t the ruin. It was the smell...\"",
    "\"Everything useful is in the edges. That's where you will find the thing that kills a person...\"",
    "\"Green means recording. Grey means off. Red means writing failed. So it was off...\"",
    "\"Someone had told the machine to stop noticing.\"",
    "\"A man texted his sister: 'algo raro con el pájaro' — something strange with the bird.\"",
    "\"Neutral. Careful. The shape of a many-headed refusal to accuse.\""
];

// --------------------------------------------------------------------------
// 3. Initialization & Stream Data Loading
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    initSettings();
    bindEvents();
    loadDataset();
});

/**
 * Initialize settings from localStorage or defaults
 */
function initSettings() {
    // Genre Cache
    const savedGenre = localStorage.getItem('genre');
    if (savedGenre && GENRES[savedGenre]) {
        state.genre = savedGenre;
        DOM.btnGenreSelect.value = savedGenre;
    }

    // Theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        state.theme = savedTheme;
        document.body.className = `theme-${savedTheme}`;
    }
    
    // Font Family
    const savedFont = localStorage.getItem('fontFamily');
    if (savedFont) {
        state.fontFamily = savedFont;
        updateFontFamilyDOM();
    }
    
    // Font Size
    const savedSize = localStorage.getItem('fontSize');
    if (savedSize) {
        state.fontSize = savedSize;
        updateFontSizeDOM();
    }
}

/**
 * Helper to fetch a dataset and stream-parse its JSON lines
 */
async function fetchAndStreamParse(url, onProgress, onItemParsed) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    
    const contentLength = response.headers.get('content-length');
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    
    let receivedLength = 0;
    let buffer = '';
    
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        receivedLength += value.length;
        buffer += decoder.decode(value, { stream: true });
        
        if (contentLength) {
            const totalBytes = parseInt(contentLength, 10);
            onProgress(receivedLength, totalBytes);
        } else {
            onProgress(receivedLength, null);
        }
        
        let lineBreakIdx;
        while ((lineBreakIdx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.substring(0, lineBreakIdx).trim();
            buffer = buffer.substring(lineBreakIdx + 1);
            
            if (line) {
                try {
                    const item = JSON.parse(line);
                    onItemParsed(item);
                } catch (err) {
                    // Suppress syntax error on partially chunked JSON streams
                }
            }
        }
    }
    
    if (buffer.trim()) {
        try {
            const item = JSON.parse(buffer.trim());
            onItemParsed(item);
        } catch (err) {}
    }
}

/**
 * Fetch and stream parse both the story and prompt datasets sequentially
 */
async function loadDataset() {
    const randQuote = LOAD_QUOTES[Math.floor(Math.random() * LOAD_QUOTES.length)];
    document.getElementById('loading-quote').textContent = randQuote;
    
    const activeGenre = GENRES[state.genre];
    const genFilename = activeGenre.generations.split('/').pop();
    const promptsFilename = activeGenre.prompts.split('/').pop();
    
    try {
        // --- PHASE 1: Loading Stories ---
        DOM.loadingStatus.textContent = `Connecting to stories: ${genFilename} (1/2)...`;
        DOM.loadingBar.style.width = '2%';
        
        await fetchAndStreamParse(
            activeGenre.generations,
            (received, total) => {
                if (total) {
                    const percent = Math.min(Math.round((received / total) * 50), 50);
                    DOM.loadingBar.style.width = `${percent}%`;
                    const mbRec = (received / 1024 / 1024).toFixed(1);
                    const mbTot = (total / 1024 / 1024).toFixed(1);
                    DOM.loadingStatus.textContent = `Stories (${genFilename}): ${percent * 2}% (${mbRec}MB / ${mbTot}MB)`;
                } else {
                    const mbRec = (received / 1024 / 1024).toFixed(1);
                    DOM.loadingStatus.textContent = `Stories: ${mbRec}MB loaded...`;
                    DOM.loadingBar.style.width = '25%';
                }
            },
            (story) => {
                state.stories.push(story);
            }
        );
        
        if (state.stories.length === 0) {
            throw new Error(`No stories were successfully loaded from ${genFilename}.`);
        }
        
        // --- PHASE 2: Loading Prompts ---
        DOM.loadingStatus.textContent = `Connecting to prompts: ${promptsFilename} (2/2)...`;
        DOM.loadingBar.style.width = '52%';
        
        await fetchAndStreamParse(
            activeGenre.prompts,
            (received, total) => {
                if (total) {
                    const percent = 50 + Math.min(Math.round((received / total) * 50), 50);
                    DOM.loadingBar.style.width = `${percent}%`;
                    const mbRec = (received / 1024 / 1024).toFixed(1);
                    const mbTot = (total / 1024 / 1024).toFixed(1);
                    DOM.loadingStatus.textContent = `Prompts (${promptsFilename}): ${(percent - 50) * 2}% (${mbRec}MB / ${mbTot}MB)`;
                } else {
                    const mbRec = (received / 1024 / 1024).toFixed(1);
                    DOM.loadingStatus.textContent = `Prompts: ${mbRec}MB loaded...`;
                    DOM.loadingBar.style.width = '75%';
                }
            },
            (promptObj) => {
                if (promptObj.custom_id) {
                    const input = promptObj.body?.input || "";
                    state.promptsMap.set(promptObj.custom_id, input);
                }
            }
        );
        
        DOM.loadingBar.style.width = '100%';
        DOM.loadingStatus.textContent = `Loaded ${state.stories.length} items from ${activeGenre.name}!`;
        
        DOM.spanTotalCount.textContent = state.stories.length;
        DOM.storyIndexInput.max = state.stories.length;
        
        // Fade out Loading Screen
        setTimeout(() => {
            DOM.loadingOverlay.classList.add('fade-out');
            const randomIndex = Math.floor(Math.random() * state.stories.length);
            displayStory(randomIndex);
        }, 800);
        
    } catch (error) {
        console.error("Fatal initialization failure:", error);
        DOM.loadingStatus.innerHTML = `<span style="color: #ef4444; font-weight: bold;">Loading Failed: ${error.message}</span>`;
        DOM.loadingBar.style.backgroundColor = '#ef4444';
        
        DOM.storyArticle.innerHTML = `
            <div class="error-banner" style="text-align: center; padding: 48px; border: 1px solid #ef4444; border-radius: 8px; background-color: rgba(239, 68, 68, 0.05); max-width: 600px; margin: 40px auto;">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#ef4444" stroke-width="2" style="margin-bottom: 16px;">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <h3 style="font-family: var(--font-display); font-size: 1.5rem; margin-bottom: 8px; color: var(--text-primary);">Unable to Load Archive</h3>
                <p style="color: var(--text-secondary); margin-bottom: 24px; font-size: 0.95rem; line-height: 1.6;">We encountered a network or formatting issue while pulling the story archive from GitHub. Please check your connection or reload the application.</p>
                <button onclick="window.location.reload()" class="primary-button" style="margin: 0 auto; background-color: #ef4444; color: white;">Retry Archive Fetch</button>
            </div>
        `;
        setTimeout(() => {
            DOM.loadingOverlay.classList.add('fade-out');
        }, 1500);
    }
}

// --------------------------------------------------------------------------
// 4. Data Extraction & Rendering Logic
// --------------------------------------------------------------------------

/**
 * Extracts story text safely from the OpenAI response structure
 */
function extractStoryText(story) {
    try {
        const body = story.response?.body;
        if (!body) return null;
        
        // GPT-5 reasoning output formatting
        if (Array.isArray(body.output)) {
            const messageObj = body.output.find(item => item.type === "message");
            if (messageObj && Array.isArray(messageObj.content) && messageObj.content.length > 0) {
                return messageObj.content[0].text;
            }
        }
        
        // Alternate legacy formats
        if (body.choices && body.choices.length > 0) {
            return body.choices[0].message?.content || body.choices[0].text;
        }
        
        if (typeof body.text === 'string') {
            return body.text;
        }
    } catch (e) {
        console.error("Text extraction parsing error:", e);
    }
    return null;
}

/**
 * Normalizes newlines and parses text into clean paragraphs
 */
function formatStoryHTML(text) {
    if (!text) return "<p>The narrative contents could not be decoded.</p>";
    
    const rawParagraphs = text.trim().replace(/\r\n/g, '\n').split(/\n\s*\n+/);
    
    return rawParagraphs
        .map(p => {
            const cleaned = p.trim();
            if (!cleaned) return '';
            
            // Clean up internal single linebreaks to prevent jagged wraps
            const normalized = cleaned.replace(/\n/g, ' ');
            return `<p>${normalized}</p>`;
        })
        .filter(p => p !== '')
        .join('\n');
}

/**
 * Normalizes user prompt spacing and maps sections to clean structured HTML components
 */
function formatUserPromptHTML(promptStr) {
    if (!promptStr) return `<div class="prompt-section"><p class="prompt-section-body">No matched prompt inputs were found.</p></div>`;
    
    // 1. Clean extra spaces between words (collapse all spaces and tabs to single spaces)
    let cleanText = promptStr.trim().replace(/[ \t]+/g, ' ');
    
    // 2. Identify sections dynamically
    const personalRegex = /Personal\s+context:/i;
    const historicalRegex = /Historical\s+context:/i;
    const taskRegex = /The\s+task:/i;
    
    const personalMatch = cleanText.match(personalRegex);
    const historicalMatch = cleanText.match(historicalRegex);
    const taskMatch = cleanText.match(taskRegex);
    
    const landmarks = [];
    if (personalMatch) landmarks.push({ type: 'personal', index: personalMatch.index, length: personalMatch[0].length });
    if (historicalMatch) landmarks.push({ type: 'historical', index: historicalMatch.index, length: historicalMatch[0].length });
    if (taskMatch) landmarks.push({ type: 'task', index: taskMatch.index, length: taskMatch[0].length });
    
    // Sort landmarks by index ascending
    landmarks.sort((a, b) => a.index - b.index);
    
    let html = "";
    
    for (let i = 0; i < landmarks.length; i++) {
        const current = landmarks[i];
        const next = landmarks[i + 1];
        
        const start = current.index + current.length;
        const end = next ? next.index : cleanText.length;
        
        const sectionContent = cleanText.substring(start, end).trim();
        
        let headingText = "";
        if (current.type === 'personal') headingText = "Personal Context";
        else if (current.type === 'historical') headingText = "Historical Context";
        else if (current.type === 'task') headingText = "The Task";
        
        if (sectionContent) {
            html += `
                <div class="prompt-section">
                    <span class="prompt-section-title">${headingText}</span>
                    <p class="prompt-section-body">${sectionContent}</p>
                </div>
            `;
        }
    }
    
    // Fallback if no sections matched
    if (!html) {
        html = `<div class="prompt-section"><p class="prompt-section-body">${cleanText}</p></div>`;
    }
    
    return html;
}

/**
 * Render the requested story by index
 */
function displayStory(index) {
    if (index < 0 || index >= state.stories.length) return;
    
    state.currentIndex = index;
    const story = state.stories[index];
    
    // 1. Text Presentation
    const rawText = extractStoryText(story);
    const formattedHTML = formatStoryHTML(rawText);
    
    // Smooth transition between stories
    DOM.storyArticle.style.opacity = 0;
    DOM.storyArticle.style.transform = 'translateY(8px)';
    
    setTimeout(() => {
        DOM.storyArticle.innerHTML = formattedHTML;
        DOM.storyArticle.style.opacity = 1;
        DOM.storyArticle.style.transform = 'translateY(0)';
        
        // Scroll back to top on story swap
        document.querySelector('.reader-viewport').scrollTop = 0;
    }, 150);
    
    // 2. Navigation State Update
    DOM.storyIndexInput.value = index + 1;
    DOM.btnPrev.disabled = (index === 0);
    DOM.btnNext.disabled = (index === state.stories.length - 1);
    
    // 3. Sync Metadata details
    updateMetadataView(story, index);
}

/**
 * Renders technical and token variables inside the drawer
 */
function updateMetadataView(story, index) {
    const body = story.response?.body || {};
    const usage = body.usage || {};
    const customId = story.custom_id;
    
    // Text labels
    DOM.metaModel.textContent = body.model || 'gpt-5-2025-08-07';
    
    // Convert epoch to user locale
    if (body.created_at) {
        const date = new Date(body.created_at * 1000);
        DOM.metaDate.textContent = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } else {
        DOM.metaDate.textContent = 'Unknown Generation Date';
    }
    
    // User Input Prompt & System Instructions
    const userPromptStr = state.promptsMap.get(customId);
    DOM.metaUserPrompt.innerHTML = formatUserPromptHTML(userPromptStr);
    DOM.metaSystemPrompt.textContent = body.instructions || 'No developer instructions were supplied.';
    
    // Token details Calculations
    const tokens = {
        total: usage.total_tokens || 0,
        input: usage.input_tokens || 0,
        output: usage.output_tokens || 0,
        reasoning: usage.output_tokens_details?.reasoning_tokens || 0
    };
    
    // Format numeric separators
    DOM.tokenTotal.textContent = tokens.total.toLocaleString();
    DOM.tokenInput.textContent = tokens.input.toLocaleString();
    DOM.tokenOutput.textContent = tokens.output.toLocaleString();
    DOM.tokenReasoning.textContent = tokens.reasoning.toLocaleString();
    
    // Progress bar ratios (normalized to total token size)
    if (tokens.total > 0) {
        const inputPercent = (tokens.input / tokens.total) * 100;
        const outputPercent = (tokens.output / tokens.total) * 100;
        const reasoningPercent = (tokens.reasoning / tokens.total) * 100;
        
        DOM.barInput.style.width = `${Math.max(inputPercent, 2)}%`;
        DOM.barOutput.style.width = `${Math.max(outputPercent, 2)}%`;
        DOM.barReasoning.style.width = `${Math.max(reasoningPercent, 2)}%`;
    } else {
        DOM.barInput.style.width = '0%';
        DOM.barOutput.style.width = '0%';
        DOM.barReasoning.style.width = '0%';
    }
}

// --------------------------------------------------------------------------
// 5. Events & Interactions Wiring
// --------------------------------------------------------------------------
function bindEvents() {
    // Genre Swap Selector
    DOM.btnGenreSelect.addEventListener('change', handleGenreSwap);

    // Theme Toggle Handler
    DOM.btnThemeToggle.addEventListener('click', toggleTheme);
    
    // Typography Adjusters
    DOM.btnFontToggle.addEventListener('click', toggleFontFamily);
    DOM.btnSizeSm.addEventListener('click', () => changeFontSize('sm'));
    DOM.btnSizeMd.addEventListener('click', () => changeFontSize('md'));
    DOM.btnSizeLg.addEventListener('click', () => changeFontSize('lg'));
    
    // Navigation Taps
    DOM.btnPrev.addEventListener('click', () => displayStory(state.currentIndex - 1));
    DOM.btnNext.addEventListener('click', () => displayStory(state.currentIndex + 1));
    DOM.btnRandom.addEventListener('click', selectRandomStory);
    DOM.btnJump.addEventListener('click', handleDirectIndexJump);
    
    // Handle Enter press inside index input
    DOM.storyIndexInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleDirectIndexJump();
    });
    
    // Drawer overlay Toggles
    DOM.btnMetadataToggle.addEventListener('click', openDrawer);
    DOM.btnCloseDrawer.addEventListener('click', closeDrawer);
    DOM.drawerBackdrop.addEventListener('click', closeDrawer);
    
    // Drawer Copy Prompt logic
    DOM.btnCopyUserPrompt.addEventListener('click', handleCopyUserPrompt);
    DOM.btnCopySystemPrompt.addEventListener('click', handleCopySystemPrompt);
}

/**
 * Event handler for dynamic genre switching
 */
function handleGenreSwap() {
    const selectedGenre = DOM.btnGenreSelect.value;
    if (selectedGenre === state.genre) return;
    
    state.genre = selectedGenre;
    localStorage.setItem('genre', selectedGenre);
    
    // Reset reader states
    state.stories = [];
    state.promptsMap.clear();
    state.currentIndex = 0;
    
    // Reset skeleton load state
    DOM.storyArticle.innerHTML = `
        <div class="story-placeholder">
            <div class="skeleton skeleton-title"></div>
            <div class="skeleton skeleton-para"></div>
            <div class="skeleton skeleton-para"></div>
            <div class="skeleton skeleton-para"></div>
        </div>
    `;
    
    // Reactivate fullscreen splash overlay smoothly
    DOM.loadingOverlay.classList.remove('fade-out');
    DOM.loadingBar.style.width = '0%';
    
    // Trigger progressive load sequence
    loadDataset();
}

/**
 * Dark/Light Mode Theme Toggle
 */
function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.body.className = `theme-${state.theme}`;
    localStorage.setItem('theme', state.theme);
}

/**
 * Toggle between serif Lora and sans-serif Inter font structures
 */
function toggleFontFamily() {
    state.fontFamily = state.fontFamily === 'serif' ? 'sans' : 'serif';
    updateFontFamilyDOM();
    localStorage.setItem('fontFamily', state.fontFamily);
}

function updateFontFamilyDOM() {
    if (state.fontFamily === 'serif') {
        DOM.storyArticle.classList.add('lora-font');
        DOM.storyArticle.classList.remove('inter-font');
        DOM.btnFontToggle.querySelector('.font-indicator').textContent = 'Ag';
        DOM.btnFontToggle.querySelector('.font-indicator').className = 'font-indicator lora-font';
        DOM.btnFontToggle.title = 'Switch to Modern Sans-Serif';
    } else {
        DOM.storyArticle.classList.remove('lora-font');
        DOM.storyArticle.classList.add('inter-font');
        DOM.btnFontToggle.querySelector('.font-indicator').textContent = 'Ab';
        DOM.btnFontToggle.querySelector('.font-indicator').className = 'font-indicator inter-font';
        DOM.btnFontToggle.title = 'Switch to Classic Serif';
    }
}

/**
 * Modify font size modifiers in reader article
 */
function changeFontSize(size) {
    state.fontSize = size;
    updateFontSizeDOM();
    localStorage.setItem('fontSize', size);
}

function updateFontSizeDOM() {
    DOM.storyArticle.classList.remove('size-sm', 'size-md', 'size-lg');
    DOM.storyArticle.classList.add(`size-${state.fontSize}`);
    
    DOM.btnSizeSm.classList.toggle('active', state.fontSize === 'sm');
    DOM.btnSizeMd.classList.toggle('active', state.fontSize === 'md');
    DOM.btnSizeLg.classList.toggle('active', state.fontSize === 'lg');
}

/**
 * Jumps to a random unique story (performs dice roll bounce)
 */
function selectRandomStory() {
    if (state.stories.length <= 1) return;
    
    // Animate Shuffle Icon
    const svgIcon = DOM.btnRandom.querySelector('svg');
    svgIcon.style.transform = 'rotate(180deg) scale(1.1)';
    svgIcon.style.transition = 'transform 0.5s ease';
    
    let randomIndex;
    do {
        randomIndex = Math.floor(Math.random() * state.stories.length);
    } while (randomIndex === state.currentIndex);
    
    setTimeout(() => {
        svgIcon.style.transform = 'rotate(0deg) scale(1)';
    }, 500);
    
    displayStory(randomIndex);
}

/**
 * Input direct number parser & bounds boundary checker
 */
function handleDirectIndexJump() {
    const rawVal = DOM.storyIndexInput.value;
    const cleanIndex = parseInt(rawVal, 10);
    
    if (isNaN(cleanIndex) || cleanIndex < 1 || cleanIndex > state.stories.length) {
        showToast(`Index Out of Range! Please enter 1 to ${state.stories.length}.`);
        DOM.storyIndexInput.value = state.currentIndex + 1;
        return;
    }
    
    displayStory(cleanIndex - 1);
}

/**
 * Metadata panel Drawer controls
 */
function openDrawer() {
    DOM.metadataDrawer.classList.add('open');
    document.body.style.overflow = 'hidden'; // Lock background scrolling
}

/**
 * Close Metadata Drawer
 */
function closeDrawer() {
    DOM.metadataDrawer.classList.remove('open');
    document.body.style.overflow = '';
}

/**
 * Clipboard copy function helper
 */
function copyToClipboard(text, successMessage) {
    if (!navigator.clipboard) {
        // Fallback for non-secure contexts
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            showToast(successMessage);
        } catch (err) {
            showToast('Clipboard copy failed.');
        }
        document.body.removeChild(textarea);
        return;
    }
    
    navigator.clipboard.writeText(text)
        .then(() => {
            showToast(successMessage);
        })
        .catch(err => {
            showToast('Clipboard copy failed.');
        });
}

function handleCopyUserPrompt() {
    const customId = state.stories[state.currentIndex]?.custom_id;
    const rawPrompt = state.promptsMap.get(customId) || "";
    const cleanPrompt = rawPrompt.trim().replace(/[ \t]+/g, ' ');
    copyToClipboard(cleanPrompt, 'Prompt Copied to Clipboard!');
}

function handleCopySystemPrompt() {
    copyToClipboard(DOM.metaSystemPrompt.textContent, 'Instructions Copied to Clipboard!');
}

/**
 * Elegant Toast Alert popup handler
 */
let toastTimeout;
function showToast(message) {
    DOM.toastMessage.textContent = message;
    DOM.toast.classList.add('show');
    
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        DOM.toast.classList.remove('show');
    }, 3000);
}
