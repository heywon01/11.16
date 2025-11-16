require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
// ⚠️ Vercel 충돌 방지를 위해 Socket.IO 서버 모듈 대신 클라이언트 모듈을 사용합니다.
const { io: SocketIOClient } = require("socket.io-client"); 

const app = express();

const PORT = process.env.PORT || 5001;
const MONGODB_URI = process.env.MONGODB_URI;
// ⚠️ 별도로 배포된 웹소켓 서버의 주소를 .env에 설정해야 합니다. (예: https://your-socket-server.com)
const SOCKET_SERVER_URL = process.env.SOCKET_SERVER_URL; 



// ===== MongoDB 연결 캐싱 로직 (서버리스 충돌 방지) =====
let isConnected = false;

async function connectToDatabase() {
    if (isConnected) {
        // 기존 연결 재사용
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
        console.error('❌ MongoDB connection error:', err.message);
        throw new Error("MongoDB 연결 실패");
    }
}

// ===== 웹소켓 서버로 알림 전송 함수 =====
function emitToSocketServer(event, data) {
    if (!SOCKET_SERVER_URL) {
        console.warn("경고: SOCKET_SERVER_URL이 설정되지 않아 실시간 알림을 보낼 수 없습니다.");
        return;
    }
    try {
        // 서버리스 환경에 최적화된 클라이언트 연결 방식
        const socketClient = SocketIOClient(SOCKET_SERVER_URL, {
             transports: ['websocket'], 
             forceNew: true 
        });
        socketClient.emit(event, data);
        socketClient.disconnect(); // 메시지 전송 후 즉시 연결 해제
    } catch (error) {
        console.error("Socket.IO 클라이언트 전송 오류:", error);
    }
}

// Middleware
app.use(express.json());
app.use(cors());

// 정적 파일 서빙 경로 설정 (CSS 파일 적용 문제 해결)
const projectRoot = path.join(__dirname, '..');
app.use('/public', express.static(path.join(projectRoot, 'public')));
app.use(express.static(projectRoot));

// API 요청 시에만 DB 연결 시도 (미들웨어)
app.use('/api', async (req, res, next) => {
    try {
        await connectToDatabase();
        next();
    } catch (error) {
        console.error('API 요청 전 DB 연결 실패:', error.message);
        res.status(503).send('Database connection unavailable.');
    }
});

// ===== Schemas and Models (점수 필드 제거됨) =====
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    isAdmin: { type: Boolean, default: false },
});

const ProblemSchema = new mongoose.Schema({
    date: { type: String, required: true, unique: true }, 
    question: { type: String, required: true }, 
    answer: { type: Number, required: true }, 
    solvers: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name: { type: String, required: true },
        isCorrect: { type: Boolean, required: true },
        solvedAt: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema); 
const Problem = mongoose.model('Problem', ProblemSchema);

// ===== Routes =====

// 루트 요청 (index.html 제공)
app.get('/', (req, res) => {
    res.sendFile(path.join(projectRoot, 'index.html'));
});

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

// 5. Admin Authentication
app.post('/api/admin/auth', (req, res) => {
    try {
        const { id, password } = req.body;

        if (id === process.env.ADMIN_ID && password === process.env.ADMIN_PASSWORD) {
            res.status(200).json({ success: true, isAdmin: true });
        } else {
            res.status(401).json({ success: false, message: '인증 실패' });
        }
    } catch (error) {
        console.error('관리자 인증 중 오류 발생:', error);
        res.status(500).send('관리자 인증 중 오류 발생');
    }
});


// 6. Add New Problem (Admin only)
app.post('/api/problems', async (req, res) => {
    try {
        const { date, question, answer, creatorId } = req.body;
        
        const newProblem = new Problem({
            date,
            question: JSON.stringify(question),
            answer: Number(answer),
            creatorId
        });

        await newProblem.save();

        // ⚠️ Socket.IO 클라이언트로 알림 전송 (이벤트명: api_new_problem)
        emitToSocketServer('api_new_problem', newProblem); 
        
        res.status(201).json({ success: true, problem: newProblem });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).send('해당 날짜에 이미 문제가 존재합니다.');
        }
        console.error("문제 추가 실패:", error);
        res.status(500).send('문제 추가 실패');
    }
});

// 7. Get All Problems
app.get('/api/problems', async (req, res) => {
    try {
        const problems = await Problem.find({});
        
        const parsedProblems = problems.map(p => {
            const problemObject = p.toObject();
            try {
                // DB에서 JSON 문자열로 저장된 question 필드를 파싱
                problemObject.question = JSON.parse(problemObject.question);
            } catch (e) {
                console.error("Failed to parse problem question:", e);
                problemObject.question = { text: "JSON 파싱 오류", image: null, options: [] };
            }
            return problemObject;
        });

        res.json(parsedProblems);

    } catch (error) {
        console.error('문제 목록 조회 실패:', error);
        res.status(500).send('문제 목록을 가져올 수 없습니다.');
    }
});

// 8. Delete Problem (Admin only)
app.delete('/api/problems/id/:problemId', async (req, res) => { 
    try {
        const { problemId } = req.params;

        const result = await Problem.deleteOne({ _id: problemId });

        if (result.deletedCount === 0) {
            return res.status(404).send('해당 문제를 찾을 수 없습니다.');
        }

        // ⚠️ Socket.IO 클라이언트로 알림 전송 (이벤트명: api_problem_deleted)
        emitToSocketServer('api_problem_deleted', problemId); 

        res.status(200).send('문제 삭제 완료');
    } catch (error) {
        console.error('문제 삭제 실패:', error);
        res.status(500).send('문제 삭제 실패');
    }
});

// 9. Solve Problem
app.post('/api/problems/:problemId/solve', async (req, res) => {
    const { problemId } = req.params;
    const { userId, selectedOption } = req.body; 

    try {
        const problem = await Problem.findById(problemId);
        const user = await User.findById(userId);

        if (!problem || !user) {
            return res.status(404).send('문제 또는 사용자를 찾을 수 없습니다.');
        }

        const alreadySolved = problem.solvers.some(s => s.userId.toString() === userId);
        if (alreadySolved) {
            return res.status(400).send('이미 이 퀴즈를 풀었습니다.');
        }

        const isCorrect = problem.answer === Number(selectedOption);

        problem.solvers.push({
            userId,
            name: user.name,
            isCorrect
        });
        const updatedProblem = await problem.save();

        // ⚠️ Socket.IO 클라이언트로 알림 전송 (이벤트명: api_problem_solved)
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

// Fallback: Catch-all 라우팅 (index.html 제공)
app.get('*', (req, res) => {
    res.sendFile(path.join(projectRoot, 'index.html'));
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