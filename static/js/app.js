let chatHistory = [];
let systemStats = {};
let recognition = null;
let speechEnabled = false;
let isListening = false;
let DATASET = window.DATASET_ID || 'sherlock';

document.addEventListener('DOMContentLoaded', function() {
    initializeSystem();
    initializeSpeechRecognition();
});

async function initializeSystem() {
    try {
        const response = await fetch(`/api/${DATASET}/initialize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (data.success) {
            systemStats = data.stats;
            hideLoadingScreen();
        } else {
            showError('Failed to initialize system: ' + data.message);
        }
    } catch (error) {
        showError('Error initializing system: ' + error.message);
    }
}

function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    const dashboard = document.getElementById('main-dashboard');
    
    loadingScreen.style.opacity = '0';
    setTimeout(() => {
        loadingScreen.style.display = 'none';
        dashboard.style.display = 'block';
        dashboard.style.opacity = '0';
        setTimeout(() => { dashboard.style.opacity = '1'; }, 50);
    }, 500);
}

async function sendMessage(event) {
    event.preventDefault();
    const input = document.getElementById('chat-input');
    const question = input.value.trim();
    if (!question) return;
    
    input.value = '';
    addMessage('user', question);
    
    const typingId = showTypingIndicator();
    setInputEnabled(false);
    
    try {
        const response = await fetch(`/api/${DATASET}/ask`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question })
        });
        
        const data = await response.json();
        removeTypingIndicator(typingId);
        
        if (data.success) {
            addMessage('assistant', data.answer);
            speakText(data.answer);
        } else {
            addMessage('assistant', 'Sorry, I encountered an error: ' + data.error);
        }
    } catch (error) {
        removeTypingIndicator(typingId);
        addMessage('assistant', 'Sorry, I encountered an error: ' + error.message);
    } finally {
        setInputEnabled(true);
        input.focus();
    }
}

function addMessage(role, content) {
    const messagesContainer = document.getElementById('chat-messages');
    const welcomeMessage = messagesContainer.querySelector('.welcome-message');
    if (welcomeMessage) welcomeMessage.remove();
    
    const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const icon = role === 'user' ? '👤' : '💬';
    const label = role === 'user' ? 'You' : 'Assistant';
    
    messageDiv.innerHTML = `
        <div class="message-header">
            <span class="message-icon">${icon}</span>
            <span class="message-sender">${label}</span>
            <span class="message-time">${timestamp}</span>
        </div>
        <div class="message-bubble">${escapeHtml(content)}</div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    chatHistory.push({ role, content, timestamp });
}

function showTypingIndicator() {
    const messagesContainer = document.getElementById('chat-messages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant';
    typingDiv.id = 'typing-indicator-' + Date.now();
    
    typingDiv.innerHTML = `
        <div class="message-header">
            <span class="message-icon">💬</span>
            <span class="message-sender">Assistant</span>
        </div>
        <div class="message-bubble typing-indicator">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;
    
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return typingDiv.id;
}

function removeTypingIndicator(id) {
    const typingDiv = document.getElementById(id);
    if (typingDiv) typingDiv.remove();
}

function askQuestion(question) {
    const input = document.getElementById('chat-input');
    input.value = question;
    input.focus();
    document.getElementById('chat-form').dispatchEvent(new Event('submit'));
}

function clearChat() {
    if (!confirm('Are you sure you want to clear the chat history?')) return;
    
    const messagesContainer = document.getElementById('chat-messages');
    messagesContainer.innerHTML = `
        <div class="welcome-message">
            <h3>Welcome!!</h3>
            <p>I can answer questions about <em>A Study in Scarlet</em> by Sir Arthur Conan Doyle.</p>
            <p>Click on an example question to get started, or type your own question below.</p>
        </div>
    `;
    
    chatHistory = [];
}

function setInputEnabled(enabled) {
    document.getElementById('chat-input').disabled = !enabled;
    document.getElementById('send-btn').disabled = !enabled;
}

function showError(message) {
    const loadingContent = document.getElementById('loading-screen').querySelector('.loading-content');
    loadingContent.innerHTML = `
        <h2>Error</h2>
        <p style="margin-top: 1rem;">${escapeHtml(message)}</p>
    `;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

document.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        const input = document.getElementById('chat-input');
        if (document.activeElement === input) {
            event.preventDefault();
            document.getElementById('chat-form').dispatchEvent(new Event('submit'));
        }
    }
});

// Speech Recognition (STT)
function initializeSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        console.warn('Speech Recognition not supported');
        const micBtn = document.getElementById('mic-btn');
        if (micBtn) {
            micBtn.disabled = true;
            micBtn.style.opacity = '0.5';
            micBtn.title = 'Speech recognition not supported';
        }
        return;
    }
    
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    
    recognition.onstart = function() {
        isListening = true;
        const micBtn = document.getElementById('mic-btn');
        micBtn.classList.add('active');
        micBtn.textContent = '🔴 Listening... Click to stop';
    };
    
    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        document.getElementById('chat-input').value = transcript;
        document.getElementById('chat-form').dispatchEvent(new Event('submit'));
    };
    
    recognition.onerror = function(event) {
        console.error('Speech recognition error:', event.error);
        resetMicButton();
        
        if (event.error === 'no-speech') {
            alert('No speech detected. Please try again.');
        } else if (event.error === 'not-allowed') {
            alert('Microphone access denied.');
        } else {
            alert('Speech recognition error: ' + event.error);
        }
    };
    
    recognition.onend = function() {
        resetMicButton();
    };
}

function toggleSpeechRecognition() {
    if (!recognition) {
        alert('Speech recognition not available. Try Chrome or Edge.');
        return;
    }
    
    if (isListening) {
        recognition.stop();
    } else {
        try {
            recognition.start();
        } catch (error) {
            console.error('Error starting recognition:', error);
            alert('Could not start speech recognition.');
        }
    }
}

function resetMicButton() {
    isListening = false;
    const micBtn = document.getElementById('mic-btn');
    if (micBtn) {
        micBtn.classList.remove('active');
        micBtn.textContent = '🎤 Speech Input. Click to start';
    }
}

// Speech Synthesis (TTS)
function toggleSpeechOutput() {
    speechEnabled = !speechEnabled;
    const speakerBtn = document.getElementById('speaker-btn');
    
    if (speakerBtn) {
        if (speechEnabled) {
            speakerBtn.classList.add('speaker-on');
            speakerBtn.textContent = '🔊 Speech Output. Click to disable';
            speakText('Speech output enabled');
        } else {
            speakerBtn.classList.remove('speaker-on');
            speakerBtn.textContent = '🔊 Speech Output. Click to enable';
            window.speechSynthesis.cancel();
        }
    }
}

function speakText(text) {
    if (!speechEnabled || !text) return;
    if (!window.speechSynthesis) {
        console.warn('Speech synthesis not supported');
        return;
    }
    
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(voice => 
        voice.lang.startsWith('en') && 
        (voice.name.includes('Google') || voice.name.includes('Microsoft'))
    );
    
    if (englishVoice) utterance.voice = englishVoice;
    utterance.onerror = (event) => console.error('TTS error:', event);
    
    window.speechSynthesis.speak(utterance);
}
