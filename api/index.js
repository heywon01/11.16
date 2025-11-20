require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
// ⚠️ Vercel 충돌 방지를 위해 Socket.IO 서버 모듈 대신 클라이언트 모듈을 사용합니다.
const { io: SocketIOClient } = require("socket.io-client"); 
const Problem = require('../models/Problem');
const User = require('../models/User');

const app = express();

const PORT = process.env.PORT || 5001;
const MONGODB_URI = process.env.MONGODB_URI;
// ⚠️ 별도로 배포된 웹소켓 서버의 주소를 .env에 설정해야 합니다. (예: https://your-socket-server.com)
const SOCKET_SERVER_URL = process.env.SOCKET_SERVER_URL; 
const projectRoot = path.join(__dirname, '..');


// ===== MongoDB 연결 캐싱 로직 (서버리스 충돌 방지) =====
let isConnected = false;

async function connectToDatabase() {
    if (isConnected) {
        return;
    }
    if (!MONGODB_URI) {
        console.error("오류: MONGODB_URI 환경 변수가 설정되지 않았습니다.");
        throw new Error("MONGODB_URI is not set.");
    }
    try {
        await mongoose.connect(MONGODB_URI);
        isConnected = true;
        console.log('✅ MongoDB connected successfully.');
    } catch (err) {
        console.error('❌ MongoDB connection error:', err);
        isConnected = false;
        throw err;
    }
}

let socket = null;
if (SOCKET_SERVER_URL) {
}

// ===== 웹소켓 서버로 알림 전송 함수 =====
function emitToSocketServer(event, data) {
    if (socket) {
        socket.emit(event, data);
    }
}

// Middleware
app.use(express.json());
app.use(cors());

app.get('/', (req, res) => {
    res.sendFile(path.join(projectRoot, 'index.html'));
});

app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(projectRoot, 'favicon.ico'));
});

// 정적 파일 서빙 경로 설정 (CSS 파일 적용 문제 해결)
app.use('/public', express.static(path.join(projectRoot, 'public')));
app.use(express.static(projectRoot));

// API 요청 시에만 DB 연결 시도 (미들웨어)
app.use('/api', async (req, res, next) => {
    await connectToDatabase();
    next();
});

// ===== Schemas and Models (점수 필드 제거됨) =====
//const UserSchema = new mongoose.Schema({
    //name: { type: String, required: true, unique: true },
    //isAdmin: { type: Boolean, default: false },
//});

//const ProblemSchema = new mongoose.Schema({
    //date: { type: String, required: true, unique: true }, 
    //question: { type: String, required: true }, 
    //answer: { type: Number, required: true }, 
    //solvers: [{
        //userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        //name: { type: String, required: true },
        //isCorrect: { type: Boolean, required: true },
        //solvedAt: { type: Date, default: Date.now }
    //}],
    //createdAt: { type: Date, default: Date.now }
//});

// ===== Routes =====

// 1. User Login/Registration
// (User.js 파일이 없으므로, 편의상 name을 이용한 간단한 upsert 로직을 사용)
app.post('/api/users/login', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).send('이름을 입력해주세요.');

        let user = await User.findOne({ name });
        if (!user) {
            // 사용자가 없으면 회원가입 (생성)
            user = new User({ name });
            await user.save();
        }
        res.status(200).json({ success: true, user });

    } catch (error) {
        console.error("로그인/회원가입 실패:", error);
        res.status(500).send('로그인 처리 실패');
    }
});


// 2. Get All Users (for leaderboard)
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find({});
        // 점수 로직 제거되었으므로, 기본 사용자 정보만 반환
        const cleanedUsers = users.map(user => ({
            _id: user._id,
            name: user.name,
            isAdmin: user.isAdmin
        }));

        res.status(200).json(cleanedUsers);
    } catch (error) {
        console.error('사용자 목록 조회 실패:', error);
        res.status(500).send('사용자 목록 로드 실패');
    }
});

// 3. Get Specific User (for status update)
app.get('/api/users/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId); 
        if (!user) {
            return res.status(404).send('사용자를 찾을 수 없습니다.');
        }
        res.json(user);
    } catch (error) {
        res.status(500).send('사용자 정보 로드 실패');
    }
});

// 4. Update User Name
app.put('/api/users/:userId', async (req, res) => {
    try {
        const { name } = req.body;
        const user = await User.findByIdAndUpdate(
            req.params.userId,
            { name },
            { new: true, runValidators: true }
        );

        if (!user) {
            return res.status(404).send('사용자를 찾을 수 없습니다.');
        }
        
        // 문제 풀이 기록의 이름도 업데이트
        await Problem.updateMany(
            { "solvers.userId": req.params.userId },
            { "$set": { "solvers.$[elem].name": name } },
            { "arrayFilters": [{ "elem.userId": req.params.userId }] }
        );

        res.json(user);
    } catch (error) {
         if (error.code === 11000) { 
             return res.status(400).send('이미 존재하는 사용자 이름입니다.');
        }
        res.status(500).send('사용자 이름 업데이트 실패');
    }
});

app.post('/api/users', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).send('이름을 입력해주세요.');
        }

        let user = await User.findOne({ name });
        if (!user) {
            user = new User({ name });
            await user.save();
        }
        
        res.status(200).json({ 
            _id: user._id, 
            name: user.name, 
            isAdmin: user.isAdmin,
            createdAt: user.createdAt 
        });

    } catch (error) {
        console.error("User registration/login error:", error);
        res.status(500).send('사용자 처리 실패');
    }
});

// 관리자 인증
app.post('/api/admin/auth', adminAuth, (req, res) => {
    res.status(200).json({ success: true, message: 'Admin authenticated' });
});

// 문제 추가 (관리자 권한 필요)
app.post('/api/problems', adminAuth, async (req, res) => {
    try {
        const { date, question, creatorId } = req.body;
        
        if (!date || !question || !question.text || !question.options || question.answer === undefined || !creatorId) {
            return res.status(400).send('필수 입력 항목이 누락되었습니다.');
        }
        
        const newProblem = new Problem({ 
            date: new Date(date), 
            question, 
            creatorId 
        });
        await newProblem.save();

        res.status(201).json(newProblem);
    } catch (error) {
        console.error("Problem creation error:", error);
        res.status(500).send('문제 생성 실패');
    }
});

// 문제 목록 조회 (날짜 기준)
app.get('/api/problems', async (req, res) => {
    try {
        const problemsList = await Problem.find({})
            .sort({ date: 1, createdAt: 1 })
            .populate('creatorId', 'name')
            .lean(); 

        res.status(200).json(problemsList);
    } catch (error) {
        console.error("Fetch problems error:", error);
        res.status(500).send('문제 목록 조회 실패');
    }
});

// 문제 목록 조회 (날짜 기준)
app.get('/api/problems/:id', async (req, res) => {
    try {
        const problemId = req.params.id;
        const problem = await Problem.findById(problemId)
            .populate('creatorId', 'name')
            .lean();

        if (!problem) {
            return res.status(404).send('문제를 찾을 수 없습니다.');
        }

        res.status(200).json(problem);
    } catch (error) {
        console.error("Fetch problem by ID error:", error);
        res.status(500).send('문제 조회 실패');
    }
});

// 퀴즈 제출 (정답 확인 및 기록)
app.post('/api/problems/:id/solve', async (req, res) => {
    try {
        const problemId = req.params.id;
        const { userId, selectedOption } = req.body;

        if (!userId || selectedOption === undefined) {
            return res.status(400).send('사용자 정보 또는 선택된 답이 누락되었습니다.');
        }

        const problem = await Problem.findById(problemId);
        const user = await User.findById(userId);

        if (!problem || !user) {
            return res.status(404).send('문제 또는 사용자를 찾을 수 없습니다.');
        }

        const alreadySolved = problem.solvers.some(s => s.userId.toString() === userId);
        if (alreadySolved) {
            return res.status(400).send('이미 이 퀴즈를 풀었습니다.');
        }

        const isCorrect = problem.question.answer === Number(selectedOption);

        problem.solvers.push({
            userId,
            name: user.name,
            isCorrect
        });
        const updatedProblem = await problem.save();

        // Socket.IO 클라이언트로 알림 전송 (외부 웹소켓 서버를 사용한다고 가정)
        emitToSocketServer('api_problem_solved', {
            problemId: problem._id,
            solverName: user.name,
            isCorrect: isCorrect
        });

        res.status(200).json({ 
            success: true, 
            isCorrect, 
            updatedProblem: updatedProblem 
        });

    } catch (error) {
        console.error("Solve error:", error);
        res.status(500).send('퀴즈 제출 실패');
    }
});

// 사용자 목록 조회 (관리자용)
app.get('/api/users/all', async (req, res) => {
    try {
        const users = await User.find({}).sort({ createdAt: -1 });
        res.status(200).json(users);
    } catch (error) {
        console.error("Fetch users error:", error);
        res.status(500).send('사용자 목록 조회 실패');
    }
});

// 사용자 목록 조회 (관리자용)
app.get('/api/users/all', async (req, res) => {
    try {
        const users = await User.find({}).sort({ createdAt: -1 });
        res.status(200).json(users);
    } catch (error) {
        console.error("Fetch users error:", error);
        res.status(500).send('사용자 목록 조회 실패');
    }
});

// 사용자 정보 수정 (관리자용)
app.put('/api/users/:id', adminAuth, async (req, res) => {
    try {
        const userId = req.params.id;
        const updates = req.body; // { name, isAdmin }
        
        const updatedUser = await User.findByIdAndUpdate(userId, updates, { new: true });

        if (!updatedUser) {
            return res.status(404).send('사용자를 찾을 수 없습니다.');
        }
        
        res.status(200).json(updatedUser);
    } catch (error) {
        console.error("Update user error:", error);
        res.status(500).send('사용자 정보 수정 실패');
    }
});

// Fallback: Catch-all 라우팅 (index.html 제공)
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/public/')) { 
        res.sendFile(path.join(projectRoot, 'index.html'));
    } else {
        // 이미 처리되었어야 하는 요청이 여기에 도달하면 404를 반환합니다.
        res.status(404).send('Not Found');
    }
});

app.use((err, req, res, next) => {
    console.error("Express App Critical Error:", err.stack); // 충돌 스택 추적을 로그에 기록
    res.status(500).send('서버 오류: ' + err.message);
});

// Vercel deployment requires the handler to be exported
module.exports = app;

// Local development server setup 
if (!process.env.VERCEL) {
    // ⚠️ 서버리스 충돌 방지를 위해 server.listen이 아닌 app.listen을 사용합니다.
    app.listen(PORT, () => {
        console.log(`🚀 Server is running on port ${PORT}`);
    });
}