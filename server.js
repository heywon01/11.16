// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
// 로컬 개발 환경을 위해 dotenv 사용. 배포 환경(Render 등)에서는 환경 변수가 자동 적용됨.
require('dotenv').config(); 

const app = express();
// PORT는 배포 환경에서 지정하는 환경 변수(예: Render의 PORT)를 사용하고, 로컬에서는 5000을 사용
const PORT = process.env.PORT || 5000; 

// --- 미들웨어 설정 ---
app.use(cors()); 
app.use(express.json()); // JSON 요청 본문 파싱

// --- MongoDB 연결 ---
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Atlas에 성공적으로 연결되었습니다.'))
    .catch(err => {
        console.error('❌ MongoDB 연결 오류:', err.message);
        process.exit(1); 
    });

// --- 데이터 모델 정의 ---
const UserSchema = new mongoose.Schema({
    userId: { type: String, unique: true, required: true }, 
    name: { type: String, required: true },
    password: { type: String }, // 관리자 인증을 위해 필요
    isAdmin: { type: Boolean, default: false },
    score: { type: Number, default: 0 },
    latestQuizDate: Date
});

// 문제 모델 (Problem)
const ProblemSchema = new mongoose.Schema({
    date: { type: String, unique: true, required: true }, // 'YYYY-MM-DD'
    question: { type: String, required: true }, // 문제 내용, 이미지, 옵션을 JSON 문자열로 저장
    answer: { type: Number, required: true }, // 정답 인덱스 (1부터 시작)
    solvers: [{ // 퀴즈를 푼 사용자 목록
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name: String,
        isCorrect: Boolean,
        solvedAt: Date
    }]
});

const User = mongoose.model('User', UserSchema);
const Problem = mongoose.model('Problem', ProblemSchema);

// --- API 라우터 (Endpoints) ---

// 1. 사용자 로그인/등록 (이름 입력 시)
app.post('/api/users/login', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).send('이름을 입력해주세요.');

    try {
        let user = await User.findOne({ name });

        if (!user) {
            // 새 사용자 등록.
            user = await User.create({ name, userId: name + Date.now() });
        }
        
        // 비밀번호 제거 후 사용자 정보 전송
        const { password, ...userData } = user.toObject();
        res.status(200).json(userData);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// **[추가]** 1-1. 단일 사용자 정보 조회
app.get('/api/users/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).send('사용자를 찾을 수 없습니다.');
        res.json(user);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// **[추가]** 1-2. 사용자 정보 수정 (이름 변경)
app.put('/api/users/:id', async (req, res) => {
    const { name } = req.body;
    try {
        // 관리자 계정 이름은 변경할 수 없도록 방지 (Admin ID: 1234aa 가정)
        const existingUser = await User.findById(req.params.id);
        if (!existingUser) return res.status(404).send('사용자를 찾을 수 없습니다.');

        if (existingUser.userId === '1234aa' && existingUser.isAdmin) {
             return res.status(403).send('관리자 계정의 이름은 변경할 수 없습니다.');
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.params.id, 
            { name }, 
            { new: true, runValidators: true }
        ).select('-password');
        
        res.json(updatedUser);
    } catch (err) {
        res.status(500).send(err.message);
    }
});


// 2. 관리자 인증 및 승격 **[수정]**
app.post('/api/admin/auth', async (req, res) => {
    const { id, password, currentUserId } = req.body; // currentUserId를 클라이언트에서 받음
    
    // script.js에 하드코딩된 관리자 정보 (1234aa, wj211@) 사용
    const ADMIN_ID = '1234aa';
    const ADMIN_PASSWORD = 'wj211@';

    if (id !== ADMIN_ID || password !== ADMIN_PASSWORD) {
        return res.status(401).send('ID 또는 비밀번호가 일치하지 않습니다.');
    }

    try {
        // 1. 관리자 계정 ID/PW로 인증 성공
        // 2. 현재 로그인된 사용자(currentUserId)를 관리자로 승격
        const user = await User.findByIdAndUpdate(
            currentUserId, 
            { isAdmin: true, userId: ADMIN_ID, password: ADMIN_PASSWORD }, // DB에 관리자 정보 업데이트
            { new: true }
        ).select('-password');

        if (!user) {
             return res.status(404).send('현재 로그인된 사용자를 찾을 수 없습니다.');
        }

        res.json(user); // 업데이트된 관리자 정보 반환
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// 3. 모든 사용자 명단 조회 (리더보드)
app.get('/api/users', async (req, res) => {
    try {
        // 관리자는 리더보드에 포함하지 않고, 점수 내림차순, 최신 풀이 시간 오름차순으로 정렬
        const users = await User.find({ isAdmin: false }).sort({ score: -1, latestQuizDate: 1 }).select('-password');
        res.json(users);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// 4. 모든 퀴즈 목록 조회 **[수정]**
app.get('/api/problems', async (req, res) => {
    try {
        const problems = await Problem.find({}).sort({ date: -1 }).lean();
        
        // 클라이언트에서 사용할 수 있도록 question 필드의 JSON 문자열을 객체로 변환
        const problemsWithDetails = problems.map(p => {
            try {
                // p.question은 "{\"text\": \"...\", \"image\": \"...\", \"options\": [...]}" 형식의 JSON 문자열
                p.question = JSON.parse(p.question); 
            } catch (e) {
                console.warn('Question field is not valid JSON for problem:', p._id);
                // 파싱 실패 시 question 필드는 텍스트 그대로 유지되거나 오류가 날 수 있음.
                // 클라이언트에서 오류 방지를 위해 기본 구조를 넣어줄 수도 있음.
            }
            return p;
        });

        res.json(problemsWithDetails);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// 5. 새 퀴즈 추가 (관리자 전용)
app.post('/api/problems', async (req, res) => {
    const { date, question, answer } = req.body;
    // 이 엔드포인트는 클라이언트에서 관리자 인증을 거쳐야 하지만, 현재는 서버에서 토큰 검증 로직이 생략되어 있습니다.
    if (!date || !question || !answer) return res.status(400).send('모든 필드를 입력해야 합니다.');

    try {
        // date 필드가 unique이므로 중복 검사가 자동으로 됩니다.
        const newProblem = await Problem.create({ date, question, answer });
        res.status(201).json(newProblem);
    } catch (err) {
        if (err.code === 11000) return res.status(409).send('이미 해당 날짜의 퀴즈가 존재합니다.');
        res.status(500).send(err.message);
    }
});

// **[추가]** 5-1. 퀴즈 삭제 (관리자 전용)
app.delete('/api/problems/:date', async (req, res) => {
    const { date } = req.params;
    // 관리자 인증 로직 생략

    try {
        const result = await Problem.deleteOne({ date });
        if (result.deletedCount === 0) {
            return res.status(404).send('해당 날짜의 퀴즈를 찾을 수 없습니다.');
        }
        res.status(200).send('퀴즈가 성공적으로 삭제되었습니다.');
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// 6. 퀴즈 제출 및 점수 업데이트 (기존과 동일)
app.post('/api/problems/:date/solve', async (req, res) => {
    const { date } = req.params;
    const { userId, answer } = req.body;
    
    try {
        const problem = await Problem.findOne({ date });
        // MongoDB ObjectId를 사용해 사용자 조회
        const user = await User.findById(userId); 

        if (!problem || !user) return res.status(404).send('퀴즈 또는 사용자를 찾을 수 없습니다.');
        
        // 이미 푼 사용자인지 확인
        const alreadySolved = problem.solvers.some(s => s.userId.equals(user._id));
        if (alreadySolved) return res.status(400).send('이미 이 퀴즈를 풀었습니다.');

        const isCorrect = problem.answer === parseInt(answer);
        
        // 퀴즈 결과 저장
        problem.solvers.push({
            userId: user._id,
            name: user.name,
            isCorrect,
            solvedAt: new Date()
        });
        await problem.save();

        let scoreChange = 0;
        if (isCorrect) {
            scoreChange = 1;
            user.score += scoreChange;
            user.latestQuizDate = new Date(); // 최종 퀴즈 풀이 시간 업데이트
            await user.save();
        }

        res.json({ success: true, isCorrect, newScore: user.score });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// --- 정적 파일 호스팅 (Express에서 프론트엔드 제공) ---
app.use(express.static(path.join(__dirname, '/'))); 

// API 경로를 제외한 모든 요청에 대해 index.html을 제공
app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).send('API Endpoint Not Found');
    }
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 서버 시작
app.listen(PORT, () => {
    console.log(`🚀 서버가 ${PORT} 포트에서 실행 중입니다.`);
});