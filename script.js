/**
 * Nabin's Quiz Platform
 * Modular architecture: StorageManager, APIHandler, QuizManager, UIManager, ThemeManager, App
 */

// ==================== CONSTANTS ====================

const TOPICS = [
    { id: 9,  name: 'General Knowledge', icon: '🌍', desc: 'Test your general awareness' },
    { id: 17, name: 'Science & Nature',  icon: '🔬', desc: 'Biology, chemistry & physics' },
    { id: 18, name: 'Computers',         icon: '💻', desc: 'Tech, coding & hardware' },
    { id: 21, name: 'Sports',            icon: '⚽', desc: 'Athletics, games & champions' },
    { id: 22, name: 'Geography',         icon: '🗺️', desc: 'Countries, capitals & maps' },
    { id: 23, name: 'History',           icon: '📜', desc: 'Events that shaped the world' },
    { id: 11, name: 'Film',              icon: '🎬', desc: 'Movies, directors & stars' },
    { id: 12, name: 'Music',             icon: '🎵', desc: 'Artists, albums & genres' },
    { id: 15, name: 'Video Games',       icon: '🎮', desc: 'Gaming trivia & classics' },
    { id: 27, name: 'Animals',           icon: '🐾', desc: 'Wildlife & natural world' },
];

const ACHIEVEMENTS = [
    { id: 'first_quiz',    label: 'First Quiz',     icon: '🎉', desc: 'Complete your first quiz' },
    { id: 'perfect',       label: 'Perfect Score',  icon: '💯', desc: 'Get 100% on any quiz' },
    { id: 'speed_runner',  label: 'Speed Runner',   icon: '⚡', desc: 'Average < 5s per question' },
    { id: 'quiz_master',   label: 'Quiz Master',    icon: '🧠', desc: 'Complete 10 quizzes' },
    { id: 'hot_streak',    label: 'Hot Streak',     icon: '🔥', desc: 'Get a 5-question streak' },
    { id: 'centurion',     label: 'Centurion',      icon: '💪', desc: 'Earn 100 total points' },
    { id: 'variety',       label: 'Explorer',       icon: '🗺️', desc: 'Play 5 different topics' },
    { id: 'top_scorer',    label: 'Top Scorer',     icon: '🏆', desc: 'Score 80%+ on a hard quiz' },
];

const TIMER_DURATION = 30; // seconds per question
const BASE_POINTS = 10;

// ==================== STORAGE MANAGER ====================

const StorageManager = {
    KEY: 'nabinsQuizData',

    load() {
        try {
            return JSON.parse(localStorage.getItem(this.KEY)) || this._defaultData();
        } catch {
            return this._defaultData();
        }
    },

    save(data) {
        localStorage.setItem(this.KEY, JSON.stringify(data));
    },

    _defaultData() {
        return {
            totalPoints: 0,
            bestStreak: 0,
            achievements: [],
            history: [],
            topicsPlayed: [],
        };
    },
};

// ==================== API HANDLER ====================

const APIHandler = {
    cache: {},

    async fetchQuestions(categoryId, difficulty, amount) {
        const key = `${categoryId}-${difficulty}-${amount}`;
        if (this.cache[key]) return this.cache[key];

        const url = `https://opentdb.com/api.php?amount=${amount}&category=${categoryId}&difficulty=${difficulty}&type=multiple`;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error('Network error');
            const data = await res.json();
            if (data.response_code !== 0 || !data.results.length) throw new Error('No questions');
            const questions = data.results.map(q => ({
                question: this._decode(q.question),
                correct: this._decode(q.correct_answer),
                options: this._shuffle([q.correct_answer, ...q.incorrect_answers].map(o => this._decode(o))),
            }));
            this.cache[key] = questions;
            return questions;
        } catch {
            return this._fallback(categoryId, amount);
        }
    },

    _decode(str) {
        const txt = document.createElement('textarea');
        txt.innerHTML = str;
        return txt.value;
    },

    _shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    },

    _fallback(categoryId, amount) {
        // Use the locally bundled questions as a fallback
        const pool = typeof questions !== 'undefined' ? questions : [];
        const mapped = pool.map(q => ({
            question: q.question,
            correct: q.answer,
            options: q.options,
        }));
        if (!mapped.length) return [];
        const result = [];
        for (let i = 0; i < amount; i++) result.push(mapped[i % mapped.length]);
        return result;
    },
};

// ==================== QUIZ MANAGER ====================

const QuizManager = {
    questions: [],
    currentIndex: 0,
    score: 0,
    points: 0,
    streak: 0,
    bestStreak: 0,
    startTime: 0,
    questionStartTime: 0,
    timePerQuestion: [],
    answers: [],
    timerInterval: null,
    timeLeft: TIMER_DURATION,
    topic: null,
    difficulty: 'medium',

    async start(topic, difficulty, amount) {
        this.topic = topic;
        this.difficulty = difficulty;
        this.questions = await APIHandler.fetchQuestions(topic.id, difficulty, amount);
        if (!this.questions.length) return false;

        this.currentIndex = 0;
        this.score = 0;
        this.points = 0;
        this.streak = 0;
        this.bestStreak = 0;
        this.answers = [];
        this.timePerQuestion = [];
        this.startTime = Date.now();
        return true;
    },

    currentQuestion() {
        return this.questions[this.currentIndex];
    },

    answer(selected) {
        const q = this.currentQuestion();
        const elapsed = (Date.now() - this.questionStartTime) / 1000;
        this.timePerQuestion.push(elapsed);
        const correct = selected === q.correct;

        let earned = 0;
        if (correct) {
            this.score++;
            this.streak++;
            if (this.streak > this.bestStreak) this.bestStreak = this.streak;
            const speedBonus = Math.max(0, Math.floor(5 * (1 - elapsed / TIMER_DURATION)));
            const multiplier = this.streak >= 5 ? 1.2 : this.streak >= 3 ? 1.1 : 1.0;
            earned = Math.round((BASE_POINTS + speedBonus) * multiplier);
            this.points += earned;
        } else {
            this.streak = 0;
        }

        this.answers.push({ question: q.question, correct: q.correct, selected, wasCorrect: correct, pointsEarned: earned });
        return correct;
    },

    next() {
        this.currentIndex++;
    },

    isFinished() {
        return this.currentIndex >= this.questions.length;
    },

    totalTime() {
        return Math.round((Date.now() - this.startTime) / 1000);
    },

    avgTimePerQ() {
        if (!this.timePerQuestion.length) return TIMER_DURATION;
        return this.timePerQuestion.reduce((a, b) => a + b, 0) / this.timePerQuestion.length;
    },

    startTimer(onTick, onExpire) {
        this.timeLeft = TIMER_DURATION;
        this.questionStartTime = Date.now();
        clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            this.timeLeft--;
            onTick(this.timeLeft);
            if (this.timeLeft <= 0) {
                clearInterval(this.timerInterval);
                onExpire();
            }
        }, 1000);
    },

    stopTimer() {
        clearInterval(this.timerInterval);
    },
};

// ==================== UI MANAGER ====================

const UIManager = {
    showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
        document.querySelectorAll('.nav-btn[data-screen]').forEach(b => {
            b.classList.toggle('active', b.dataset.screen === this._screenToNav(id));
        });
        window.scrollTo(0, 0);
    },

    _screenToNav(screenId) {
        const map = { dashboardScreen: 'dashboard', historyScreen: 'history' };
        return map[screenId] || '';
    },

    renderDashboard(data) {
        const quizzes = data.history.length;
        const avgScore = quizzes
            ? Math.round(data.history.reduce((sum, h) => sum + (h.score / h.total) * 100, 0) / quizzes)
            : 0;

        document.getElementById('totalPoints').textContent = data.totalPoints;
        document.getElementById('totalQuizzes').textContent = quizzes;
        document.getElementById('avgScore').textContent = avgScore + '%';
        document.getElementById('bestStreak').textContent = data.bestStreak;

        this.renderTopics(data);
        this.renderAchievements(data.achievements, document.getElementById('achievementsBar'));
        this.renderLeaderboard(data.history);
    },

    renderTopics(data) {
        const grid = document.getElementById('topicsGrid');
        grid.innerHTML = '';
        TOPICS.forEach(topic => {
            const played = data.history.filter(h => h.topicId === topic.id);
            const wins = played.filter(h => (h.score / h.total) >= 0.6).length;
            const card = document.createElement('div');
            card.className = 'topic-card';
            card.innerHTML = `
                <span class="topic-icon">${topic.icon}</span>
                <span class="topic-name">${topic.name}</span>
                <span class="topic-desc">${topic.desc}</span>
                <span class="topic-stats">${played.length ? `${played.length} played · ${wins}W` : 'Not played yet'}</span>
            `;
            card.addEventListener('click', () => App.startQuiz(topic));
            grid.appendChild(card);
        });
    },

    renderAchievements(unlocked, container) {
        container.innerHTML = '';
        ACHIEVEMENTS.forEach(a => {
            const isUnlocked = unlocked.includes(a.id);
            const badge = document.createElement('div');
            badge.className = `achievement-badge ${isUnlocked ? 'unlocked' : 'locked'}`;
            badge.title = a.desc;
            badge.innerHTML = `${a.icon} ${a.label}`;
            container.appendChild(badge);
        });
    },

    renderLeaderboard(history) {
        const lb = document.getElementById('leaderboard');
        if (!history.length) {
            lb.innerHTML = '<div class="leaderboard-empty">No quiz results yet. Start playing! 🎯</div>';
            return;
        }
        const top = [...history]
            .sort((a, b) => b.points - a.points)
            .slice(0, 8);
        const medals = ['🥇', '🥈', '🥉'];
        lb.innerHTML = top.map((h, i) => `
            <div class="leaderboard-row">
                <span class="lb-rank">${medals[i] || (i + 1)}</span>
                <span class="lb-topic">${h.topicName}</span>
                <span class="lb-score">${h.points} pts</span>
                <span class="lb-date">${new Date(h.date).toLocaleDateString()}</span>
            </div>
        `).join('');
    },

    renderHistory(history, topicFilter) {
        const list = document.getElementById('historyList');
        const filtered = topicFilter === 'all' ? history : history.filter(h => String(h.topicId) === topicFilter);

        if (!filtered.length) {
            list.innerHTML = '<div class="history-empty">No quiz history yet. Play some quizzes! 🎮</div>';
            return;
        }

        list.innerHTML = [...filtered].reverse().map(h => {
            const pct = Math.round((h.score / h.total) * 100);
            const cls = pct >= 80 ? 'good' : pct >= 50 ? 'ok' : 'poor';
            return `
                <div class="history-item">
                    <div class="history-meta">
                        <span class="history-topic">${h.topicIcon} ${h.topicName}</span>
                        <span class="history-date">${new Date(h.date).toLocaleString()}</span>
                        <div class="history-detail">
                            <span>⏱ ${h.timeTaken}s</span>
                            <span>⭐ ${h.points} pts</span>
                            <span>🔥 Streak: ${h.bestStreak}</span>
                            <span class="badge ${h.difficulty}">${h.difficulty}</span>
                        </div>
                    </div>
                    <span class="history-score-badge ${cls}">${h.score}/${h.total} · ${pct}%</span>
                </div>
            `;
        }).join('');
    },

    updateHistoryFilter(history) {
        const sel = document.getElementById('historyTopicFilter');
        const played = [...new Map(history.map(h => [h.topicId, h])).values()];
        sel.innerHTML = '<option value="all">All Topics</option>' +
            played.map(h => `<option value="${h.topicId}">${h.topicIcon} ${h.topicName}</option>`).join('');
    },

    renderQuizQuestion(q, index, total, difficulty) {
        document.getElementById('questionText').textContent = q.question;
        document.getElementById('progressLabel').textContent = `${index + 1} / ${total}`;
        document.getElementById('progressFill').style.width = `${((index + 1) / total) * 100}%`;
        document.getElementById('quizTopicLabel').textContent = QuizManager.topic ? QuizManager.topic.name : '';
        const diffBadge = document.getElementById('quizDifficultyBadge');
        diffBadge.textContent = difficulty;
        diffBadge.className = `badge ${difficulty}`;
        document.getElementById('nextBtn').style.display = 'none';

        const grid = document.getElementById('optionsGrid');
        grid.innerHTML = '';
        q.options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.textContent = opt;
            btn.addEventListener('click', () => App.handleAnswer(opt));
            grid.appendChild(btn);
        });
    },

    showAnswerFeedback(selectedBtn, correct, correctText) {
        document.querySelectorAll('.option-btn').forEach(b => {
            b.disabled = true;
            if (b.textContent === correctText) b.classList.add('correct');
        });
        if (selectedBtn.textContent !== correctText) selectedBtn.classList.add('incorrect');
        document.getElementById('nextBtn').style.display = 'inline-block';
    },

    updateLiveStats(score, streak, points) {
        document.getElementById('liveScore').textContent = score;
        document.getElementById('liveStreak').textContent = streak;
        document.getElementById('livePoints').textContent = points;
    },

    updateTimer(seconds) {
        const el = document.getElementById('timerDisplay');
        el.textContent = seconds;
        el.className = seconds <= 5 ? 'danger' : seconds <= 10 ? 'warning' : '';
    },

    renderResults(data, newAchievements) {
        const pct = Math.round((data.score / data.total) * 100);
        document.getElementById('resultsTitle').textContent =
            pct === 100 ? 'Perfect Score! 🏆' : pct >= 80 ? 'Excellent! 🎉' : pct >= 60 ? 'Good Job! 👍' : 'Keep Practicing! 💪';

        document.getElementById('scoreText').textContent = `You scored ${data.score} out of ${data.total}`;
        document.getElementById('timeTaken').textContent = data.timeTaken + 's';
        document.getElementById('pointsEarned').textContent = data.points;
        document.getElementById('resultStreak').textContent = data.bestStreak;
        document.getElementById('resultDifficulty').textContent = data.difficulty;

        // Animate circular progress
        const circle = document.getElementById('circularProgress');
        const valEl = document.getElementById('progressValue');
        let current = 0;
        const interval = setInterval(() => {
            current++;
            valEl.textContent = current + '%';
            circle.style.background = `conic-gradient(var(--primary) ${current * 3.6}deg, var(--bg3) 0deg)`;
            if (current >= pct) clearInterval(interval);
        }, 15);

        // New achievements
        const achDiv = document.getElementById('newAchievements');
        const achList = document.getElementById('newAchievementsList');
        if (newAchievements.length) {
            achDiv.style.display = 'block';
            this.renderAchievements(newAchievements.map(a => a.id), achList);
        } else {
            achDiv.style.display = 'none';
        }

        // Breakdown
        document.getElementById('breakdownList').innerHTML = data.answers.map((a, i) => `
            <div class="breakdown-item ${a.wasCorrect ? 'correct' : 'incorrect'}">
                <div class="breakdown-q">${i + 1}. ${a.question}</div>
                <div class="breakdown-answers">
                    <span class="breakdown-correct">✅ ${a.correct}</span>
                    ${!a.wasCorrect ? `<span class="breakdown-user">❌ You: ${a.selected || 'Time out'}</span>` : ''}
                    <span>+${a.pointsEarned} pts</span>
                </div>
            </div>
        `).join('');
    },
};

// ==================== THEME MANAGER ====================

const ThemeManager = {
    init() {
        const saved = localStorage.getItem('quizTheme') || 'dark';
        this.apply(saved);
    },

    toggle() {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        this.apply(current === 'dark' ? 'light' : 'dark');
    },

    apply(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('quizTheme', theme);
        const btn = document.getElementById('themeToggle');
        if (btn) btn.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
    },
};

// ==================== ACHIEVEMENTS CHECKER ====================

function checkAchievements(data, quizResult) {
    const unlocked = new Set(data.achievements);
    const newOnes = [];

    const check = (id) => {
        if (!unlocked.has(id)) {
            unlocked.add(id);
            const a = ACHIEVEMENTS.find(a => a.id === id);
            if (a) newOnes.push(a);
        }
    };

    if (data.history.length >= 1) check('first_quiz');
    if (quizResult.score === quizResult.total) check('perfect');
    if (quizResult.avgTimePerQ < 5) check('speed_runner');
    if (data.history.length >= 10) check('quiz_master');
    if (quizResult.bestStreak >= 5) check('hot_streak');
    if (data.totalPoints >= 100) check('centurion');
    const uniqueTopics = new Set(data.history.map(h => h.topicId)).size;
    if (uniqueTopics >= 5) check('variety');
    if (quizResult.difficulty === 'hard' && (quizResult.score / quizResult.total) >= 0.8) check('top_scorer');

    data.achievements = [...unlocked];
    return newOnes;
}

// ==================== APP (MAIN CONTROLLER) ====================

const App = {
    data: null,
    currentTopic: null,

    init() {
        this.data = StorageManager.load();
        ThemeManager.init();
        this.bindEvents();
        UIManager.renderDashboard(this.data);
        UIManager.showScreen('dashboardScreen');
    },

    bindEvents() {
        // Nav buttons
        document.querySelectorAll('.nav-btn[data-screen]').forEach(btn => {
            btn.addEventListener('click', () => {
                const screen = btn.dataset.screen;
                if (screen === 'history') {
                    UIManager.updateHistoryFilter(this.data.history);
                    UIManager.renderHistory(this.data.history, 'all');
                    UIManager.showScreen('historyScreen');
                } else {
                    UIManager.renderDashboard(this.data);
                    UIManager.showScreen('dashboardScreen');
                }
            });
        });

        document.getElementById('logoLink').addEventListener('click', (e) => {
            e.preventDefault();
            UIManager.renderDashboard(this.data);
            UIManager.showScreen('dashboardScreen');
        });

        document.getElementById('themeToggle').addEventListener('click', () => ThemeManager.toggle());

        // Quiz controls
        document.getElementById('quitQuizBtn').addEventListener('click', () => {
            QuizManager.stopTimer();
            UIManager.renderDashboard(this.data);
            UIManager.showScreen('dashboardScreen');
        });

        document.getElementById('nextBtn').addEventListener('click', () => this.nextQuestion());
        document.getElementById('goHomeBtn').addEventListener('click', () => {
            UIManager.renderDashboard(this.data);
            UIManager.showScreen('dashboardScreen');
        });
        document.getElementById('playAgainBtn').addEventListener('click', () => {
            if (this.currentTopic) this.startQuiz(this.currentTopic);
        });

        // History filter
        document.getElementById('historyTopicFilter').addEventListener('change', (e) => {
            UIManager.renderHistory(this.data.history, e.target.value);
        });

        document.getElementById('clearHistoryBtn').addEventListener('click', () => {
            if (confirm('Clear all quiz history?')) {
                this.data.history = [];
                StorageManager.save(this.data);
                UIManager.renderHistory(this.data.history, 'all');
                UIManager.updateHistoryFilter(this.data.history);
            }
        });
    },

    async startQuiz(topic) {
        this.currentTopic = topic;
        const difficulty = document.getElementById('difficultySelect').value;
        const amount = parseInt(document.getElementById('questionCountSelect').value, 10);

        UIManager.showScreen('quizScreen');
        document.getElementById('questionText').textContent = '⏳ Loading questions...';
        document.getElementById('optionsGrid').innerHTML = '';
        document.getElementById('nextBtn').style.display = 'none';

        const ok = await QuizManager.start(topic, difficulty, amount);
        if (!ok) {
            document.getElementById('questionText').textContent = '❌ Failed to load questions. Try again.';
            return;
        }
        this.showCurrentQuestion();
    },

    showCurrentQuestion() {
        const q = QuizManager.currentQuestion();
        UIManager.renderQuizQuestion(q, QuizManager.currentIndex, QuizManager.questions.length, QuizManager.difficulty);
        UIManager.updateLiveStats(QuizManager.score, QuizManager.streak, QuizManager.points);
        UIManager.updateTimer(TIMER_DURATION);

        QuizManager.startTimer(
            (t) => UIManager.updateTimer(t),
            () => this.handleTimerExpiry()
        );
    },

    handleAnswer(selected) {
        QuizManager.stopTimer();
        const correct = QuizManager.answer(selected);
        const q = QuizManager.currentQuestion();
        const selectedBtn = [...document.querySelectorAll('.option-btn')].find(b => b.textContent === selected);
        UIManager.showAnswerFeedback(selectedBtn, correct, q.correct);
        UIManager.updateLiveStats(QuizManager.score, QuizManager.streak, QuizManager.points);
    },

    handleTimerExpiry() {
        // Record as unanswered
        const q = QuizManager.currentQuestion();
        const elapsed = TIMER_DURATION;
        QuizManager.timePerQuestion.push(elapsed);
        QuizManager.streak = 0;
        QuizManager.answers.push({ question: q.question, correct: q.correct, selected: null, wasCorrect: false, pointsEarned: 0 });
        document.querySelectorAll('.option-btn').forEach(b => {
            b.disabled = true;
            if (b.textContent === q.correct) b.classList.add('correct');
        });
        document.getElementById('nextBtn').style.display = 'inline-block';
        UIManager.updateLiveStats(QuizManager.score, QuizManager.streak, QuizManager.points);
    },

    nextQuestion() {
        QuizManager.next();
        if (QuizManager.isFinished()) {
            this.finishQuiz();
        } else {
            this.showCurrentQuestion();
        }
    },

    finishQuiz() {
        QuizManager.stopTimer();
        const result = {
            topicId: this.currentTopic.id,
            topicName: this.currentTopic.name,
            topicIcon: this.currentTopic.icon,
            difficulty: QuizManager.difficulty,
            score: QuizManager.score,
            total: QuizManager.questions.length,
            points: QuizManager.points,
            bestStreak: QuizManager.bestStreak,
            timeTaken: QuizManager.totalTime(),
            avgTimePerQ: QuizManager.avgTimePerQ(),
            answers: QuizManager.answers,
            date: new Date().toISOString(),
        };

        this.data.history.push(result);
        this.data.totalPoints += result.points;
        if (result.bestStreak > this.data.bestStreak) this.data.bestStreak = result.bestStreak;
        if (!this.data.topicsPlayed.includes(this.currentTopic.id)) {
            this.data.topicsPlayed.push(this.currentTopic.id);
        }

        const newAchievements = checkAchievements(this.data, result);
        StorageManager.save(this.data);

        UIManager.renderResults(result, newAchievements);
        UIManager.showScreen('resultsScreen');
    },
};

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => App.init());