// Configuration
const API_URL = 'https://jobtales-4hq1do2e.b4a.run/generate-job-tale';
const API_TIMEOUT_MS = 90 * 60 * 1000; // 90 minutes timeout (1.5 hours)

// State Management
const state = {
    currentStoryIdea: '',
    clarificationQuestions: [],
    isLoading: false,
    currentTaleMarkdown: '', // Store the markdown content
    startTime: null, // Track generation start time
    timerInterval: null, // Store timer interval ID
    generationTime: 0 // Store final generation time in seconds
};

// DOM Elements
const elements = {
    // Sections
    storyInputSection: document.getElementById('story-input-section'),
    clarificationSection: document.getElementById('clarification-section'),
    resultSection: document.getElementById('result-section'),
    errorSection: document.getElementById('error-section'),
    
    // Forms
    storyForm: document.getElementById('story-form'),
    clarificationForm: document.getElementById('clarification-form'),
    
    // Inputs
    storyIdea: document.getElementById('story-idea'),
    questionsContainer: document.getElementById('questions-container'),
    
    // Buttons
    submitStoryBtn: document.getElementById('submit-story-btn'),
    submitAnswersBtn: document.getElementById('submit-answers-btn'),
    backBtn: document.getElementById('back-btn'),
    newStoryBtn: document.getElementById('new-story-btn'),
    retryBtn: document.getElementById('retry-btn'),
    copyBtn: document.getElementById('copy-btn'),
    downloadMdBtn: document.getElementById('download-md-btn'),
    downloadTxtBtn: document.getElementById('download-txt-btn'),
    
    // Content
    taleContent: document.getElementById('tale-content'),
    errorMessage: document.getElementById('error-message'),
    copyToast: document.getElementById('copy-toast')
};

// Section Navigation
function showSection(sectionToShow) {
    // Hide all sections
    [elements.storyInputSection, elements.clarificationSection, 
     elements.resultSection, elements.errorSection].forEach(section => {
        section.style.display = 'none';
        section.classList.remove('active');
    });
    
    // Show the target section
    sectionToShow.style.display = 'block';
    setTimeout(() => sectionToShow.classList.add('active'), 10);
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===================================
// Loading States
// ===================================
function setLoadingState(button, isLoading) {
    const btnText = button.querySelector('.btn-text');
    const btnLoader = button.querySelector('.btn-loader');
    
    if (isLoading) {
        btnText.style.display = 'none';
        btnLoader.style.display = 'flex';
        button.disabled = true;
    } else {
        btnText.style.display = 'flex';
        btnLoader.style.display = 'none';
        button.disabled = false;
    }
}

// ===================================
// API Communication
// ===================================
async function sendToAPI(storyIdea) {
    try {
        state.isLoading = true;
        
        // Create AbortController with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
        
        const response = await fetch(API_URL, {
            method: 'POST',
            mode: 'cors',
            credentials: 'omit',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'ngrok-skip-browser-warning': 'true', // Skip ngrok browser warning
            },
            body: JSON.stringify({
                free_text_story_idea: storyIdea
            }),
            signal: controller.signal
        });
        
        // Clear timeout if request completes
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `Server error: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
        
    } catch (error) {
        if (error.name === 'AbortError') {
            const timeoutMinutes = API_TIMEOUT_MS / (60 * 1000);
            console.error(`Request timeout after ${timeoutMinutes} minutes`);
            throw new Error(`Request timed out after ${timeoutMinutes} minutes. The generation is taking longer than expected.`);
        }
        
        // Better error handling for network errors
        if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
            console.error('Network Error:', error);
            throw new Error('Connection lost to server. Please check your internet connection and try again.');
        }
        
        console.error('API Error:', error);
        throw error;
    } finally {
        state.isLoading = false;
    }
}

// ===================================
// Handle Initial Story Submission
// ===================================
async function handleStorySubmit(event) {
    event.preventDefault();
    
    const storyIdea = elements.storyIdea.value.trim();
    if (!storyIdea) return;
    
    state.currentStoryIdea = storyIdea;
    setLoadingState(elements.submitStoryBtn, true);
    startTimer();
    
    try {
        const response = await sendToAPI(storyIdea);
        stopTimer(); // Stop the timer
        handleAPIResponse(response);
    } catch (error) {
        stopTimer(); // Stop timer on error too
        showError(error.message || 'Failed to generate job tale. Please try again.');
    } finally {
        setLoadingState(elements.submitStoryBtn, false);
    }
}

// ===================================
// Handle API Response
// ===================================
function handleAPIResponse(response) {
    // Case A: Clarification needed
    if (response.needs_clarification === true && response.questions) {
        // Don't display time yet - clarification is still ongoing
        state.clarificationQuestions = response.questions;
        displayClarificationQuestions(response.questions);
        showSection(elements.clarificationSection);
    }
    // Case B: Job tale generated
    else if (response.needs_clarification === false || response.story_narration) {
        // Handle both possible response formats
        const jobTale = response.job_tale || response.story_narration || response;
        displayJobTale(jobTale);
        showSection(elements.resultSection);
    }
    // Unexpected format
    else {
        showError('Unexpected response format from server.');
    }
}

// ===================================
// Display Clarification Questions
// ===================================
function displayClarificationQuestions(questions) {
    elements.questionsContainer.innerHTML = '';
    
    questions.forEach((question, index) => {
        const questionGroup = document.createElement('div');
        questionGroup.className = 'question-group';
        
        const label = document.createElement('label');
        label.className = 'question-label';
        label.innerHTML = `
            <span class="question-number">${index + 1}</span>
            ${escapeHtml(question)}
        `;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.name = `answer-${index}`;
        input.className = 'answer-input';
        input.required = true;
        input.placeholder = 'Your answer...';
        
        questionGroup.appendChild(label);
        questionGroup.appendChild(input);
        elements.questionsContainer.appendChild(questionGroup);
    });
}

// ===================================
// Handle Clarification Submission
// ===================================
async function handleClarificationSubmit(event) {
    event.preventDefault();
    
    const answerInputs = elements.questionsContainer.querySelectorAll('.answer-input');
    const answers = [];
    
    // Collect all answers
    answerInputs.forEach((input, index) => {
        const answer = input.value.trim();
        if (answer) {
            answers.push(`Q${index + 1}: ${answer}`);
        }
    });
    
    if (answers.length === 0) {
        showError('Please answer at least one question.');
        return;
    }
    
    // Merge answers into single string
    const mergedAnswers = answers.join('\n');
    
    setLoadingState(elements.submitAnswersBtn, true);
    startTimer();
    
    try {
        const response = await sendToAPI(mergedAnswers);
        stopTimer(); // Stop timer when response received
        handleAPIResponse(response);
    } catch (error) {
        stopTimer(); // Stop timer on error too
        showError(error.message || 'Failed to process answers. Please try again.');
    } finally {
        setLoadingState(elements.submitAnswersBtn, false);
    }
}

// ===================================
// Display Job Tale (with Markdown)
// ===================================
function displayJobTale(tale) {
    // Store the markdown content in state
    if (typeof tale === 'string') {
        state.currentTaleMarkdown = tale;
    } else if (typeof tale === 'object') {
        state.currentTaleMarkdown = JSON.stringify(tale, null, 2);
    } else {
        state.currentTaleMarkdown = 'Unable to display job tale.';
    }
    
    // Convert markdown to HTML using marked.js
    const htmlContent = marked.parse(state.currentTaleMarkdown);
    elements.taleContent.innerHTML = htmlContent;
}

// ===================================
// Error Handling
// ===================================
function showError(message) {
    elements.errorMessage.textContent = message;
    showSection(elements.errorSection);
}

// ===================================
// Reset & Navigation
// ===================================
function resetToInitial() {
    elements.storyForm.reset();
    state.currentStoryIdea = '';
    state.clarificationQuestions = [];
    showSection(elements.storyInputSection);
}

function retryFromError() {
    if (state.clarificationQuestions.length > 0) {
        showSection(elements.clarificationSection);
    } else {
        resetToInitial();
    }
}

// ===================================
// Utility Functions
// ===================================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===================================
// Timer Functions
// ===================================
function startTimer() {
    // Record start time
    state.startTime = Date.now();
    
    // Show timer displays
    const timer1 = document.getElementById('timer-1');
    const timer2 = document.getElementById('timer-2');
    if (timer1) timer1.style.display = 'flex';
    if (timer2) timer2.style.display = 'flex';
    
    // Clear any existing timer
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
    }
    
    // Update every 100ms
    state.timerInterval = setInterval(() => {
        if (!state.startTime) return;
        
        const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(1);
        
        // Update all timer value displays
        const timerValues = document.querySelectorAll('.timer-value');
        timerValues.forEach(timerValue => {
            timerValue.textContent = `${elapsed}s`;
        });
    }, 100);
}

function stopTimer() {
    // Clear the interval
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
    
    // Hide timer displays
    const timer1 = document.getElementById('timer-1');
    const timer2 = document.getElementById('timer-2');
    if (timer1) timer1.style.display = 'none';
    if (timer2) timer2.style.display = 'none';
    
    // Calculate final time (for potential future use)
    if (state.startTime) {
        state.generationTime = (Date.now() - state.startTime) / 1000;
    }
}

// ===================================
// Copy & Download Functions
// ===================================
function showCopyToast() {
    elements.copyToast.classList.add('show');
    setTimeout(() => {
        elements.copyToast.classList.remove('show');
    }, 2000);
}

async function copyToClipboard() {
    try {
        await navigator.clipboard.writeText(state.currentTaleMarkdown);
        showCopyToast();
    } catch (error) {
        console.error('Failed to copy:', error);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = state.currentTaleMarkdown;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showCopyToast();
        } catch (err) {
            alert('Failed to copy to clipboard');
        }
        document.body.removeChild(textArea);
    }
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function downloadMarkdown() {
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `job-tale-${timestamp}.md`;
    downloadFile(state.currentTaleMarkdown, filename, 'text/markdown');
}

function downloadText() {
    // Convert markdown to plain text (remove markdown syntax)
    let plainText = state.currentTaleMarkdown
        .replace(/#{1,6}\s/g, '') // Remove heading markers
        .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
        .replace(/\*(.+?)\*/g, '$1') // Remove italic
        .replace(/\[(.+?)\]\(.+?\)/g, '$1') // Remove links, keep text
        .replace(/`(.+?)`/g, '$1') // Remove inline code
        .replace(/^\s*[-*+]\s/gm, '• '); // Replace list markers with bullets
    
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `job-tale-${timestamp}.txt`;
    downloadFile(plainText, filename, 'text/plain');
}

// ===================================
// Event Listeners
// ===================================
elements.storyForm.addEventListener('submit', handleStorySubmit);
elements.clarificationForm.addEventListener('submit', handleClarificationSubmit);
elements.backBtn.addEventListener('click', resetToInitial);
elements.newStoryBtn.addEventListener('click', resetToInitial);
elements.retryBtn.addEventListener('click', retryFromError);

// Action button event listeners
elements.copyBtn.addEventListener('click', copyToClipboard);
elements.downloadMdBtn.addEventListener('click', downloadMarkdown);
elements.downloadTxtBtn.addEventListener('click', downloadText);

// ===================================
// Initialize
// ===================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('Job Tales frontend loaded successfully');
    
    // Configure marked.js for better markdown rendering
    if (typeof marked !== 'undefined') {
        marked.setOptions({
            breaks: true,
            gfm: true,
            headerIds: true,
            mangle: false
        });
    }
});
