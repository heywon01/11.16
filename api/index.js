require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const http = require('http');
const { Server } = require("socket.io");

const app = express();
const PORT = process.env.PORT || 5001;
const MONGODB_URI = process.env.MONGODB_URI;

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static('public'));


const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*", // 모든 도메인 허용. 배포 시 특정 도메인으로 변경 권장
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
  console.log('✅ Socket.IO: 새로운 사용자 연결됨 (' + socket.id + ')');
});

const uri = process.env.MONGODB_URI; 

if (!uri) {
    console.error("오류: MONGODB_URI 환경 변수가 설정되지 않았습니다.");
}

// MongoDB Connection
mongoose.connect(uri)
    .then(() => {
        console.log('MongoDB connected successfully');
    })
    .catch(err => {
        console.error('MongoDB connection error:', err.message);
    });


// ===== Schemas and Models (점수 필드 제거) =====

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    // score 필드 제거 ------------------
    isAdmin: { type: Boolean, default: false },
});

const ProblemSchema = new mongoose.Schema({
    date: { type: String, required: true, unique: true }, // YYYY-MM-DD 형식의 날짜
    // question 필드는 문제 내용, 이미지, 선택지 목록을 JSON 문자열로 저장
    question: { type: String, required: true }, 
    answer: { type: Number, required: true }, // 정답 선택지의 인덱스 (1부터 시작)
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
// 정적 파일 서빙 경로 설정 (클라이언트 HTML/CSS/JS)
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// 1. User Login/Registration
app.post('/api/users/login', async (req, res) => {
    try {
        const { name } = req.body;

        if (!name || name.trim() === '') {
            return res.status(400).send('사용자 이름은 필수입니다.');
        }

        let user = await User.findOne({ name });

        if (!user) {
            // New user registration
            user = new User({ name, isAdmin: false });
            await user.save();
        }

        // Existing user login
        res.status(200).json({
            _id: user._id, 
            name: user.name, 
            isAdmin: user.isAdmin
        });
    } catch (error) {
        console.error('사용자 로그인/등록 중 DB 오류:', error);
        res.status(500).send('사용자 처리 중 오류 발생');
    }
});

// 2. Get All Users (for leaderboard)
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find({});

        const cleanedUsers = users.map(user => ({
            _id: user._id,
            name: user.name,
            isAdmin: user.isAdmin
            // score 필드 응답에서 제거
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
        const user = await User.findById(req.params.userId).select('-score'); // score 필드 제외
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
            // 인증 성공 시 응답 (클라이언트가 isAdmin을 true로 설정하게 함)
            res.status(200).json({ success: true, isAdmin: true });
        } else {
            // 인증 실패
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
        // problemData는 클라이언트에서 이미 구성되어 있으므로 그대로 사용
        const { date, question, answer, creatorId } = req.body;
        
        const newProblem = new Problem({
            date,
            // question은 객체 형태로 오므로, DB 저장을 위해 JSON 문자열로 변환
            question: JSON.stringify(question),
            answer: Number(answer),
            creatorId
        });

        // 문제 데이터를 DB에 저장
        await newProblem.save();

        io.emit('new_problem', newProblem);
        
        // 저장 성공 응답
        res.status(201).json({ success: true, problem: newProblem });

    } catch (error) {
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
                // 클라이언트(script.js)에서 question 필드를 JSON 문자열로 저장했으므로 파싱해야 합니다.
                problemObject.question = JSON.parse(problemObject.question);
            } catch (e) {
                console.error("Failed to parse problem question:", e);
                // 파싱 실패 시 기본값 설정
                problemObject.question = { text: "JSON 파싱 오류", image: null, options: [] };
            }
            return problemObject;
        });

        // 3. 파싱된 문제 목록 응답
        res.json(parsedProblems);

    } catch (error) {
        console.error('문제 목록 조회 실패:', error);
        res.status(500).send('문제 목록을 가져올 수 없습니다.');
    }
});

// 8. Delete Problem (Admin only)
app.delete('/api/problems/id/:problemId', async (req, res) => { // :problemDate 대신 :problemId 사용 권장
    try {
        const { problemId } = req.params;

        const result = await Problem.deleteOne({ _id: problemId });

        if (result.deletedCount === 0) {
            return res.status(404).send('해당 문제를 찾을 수 없습니다.');
        }

        res.status(200).send('문제 삭제 완료');
    } catch (error) {
        res.status(500).send('문제 삭제 실패');
    }
});

// 9. Solve Problem (점수 로직 제거)
app.post('/api/problems/:problemId/solve', async (req, res) => {
    const { problemId } = req.params;
    const { userId, selectedOption } = req.body; // 클라이언트에서 'answer' 대신 'selectedOption'을 사용하는 것으로 통일

    try {
        const problem = await Problem.findById(problemId);
        const user = await User.findById(userId);

        if (!problem || !user) {
            return res.status(404).send('문제 또는 사용자를 찾을 수 없습니다.');
        }

        // 이미 푼 사용자인지 확인
        const alreadySolved = problem.solvers.some(s => s.userId.toString() === userId);
        if (alreadySolved) {
            return res.status(400).send('이미 이 퀴즈를 풀었습니다.');
        }

        const isCorrect = problem.answer === Number(selectedOption);

        // ----------------------------------------------------
        // 기존 점수 업데이트 로직 제거
        // user.score += scoreChange;
        // await user.save();
        // ----------------------------------------------------

        // 문제의 solvers 목록 업데이트
        problem.solvers.push({
            userId,
            name: user.name,
            isCorrect
        });
        const updatedProblem = await problem.save();

        // 클라이언트에서 필요한 정보만 응답
        res.status(200).json({ 
            success: true, 
            isCorrect, 
            updatedProblem: updatedProblem // 업데이트된 문제 객체를 클라이언트에 반환
        });

    } catch (error) {
        console.error("Solve error:", error);
        res.status(500).send('퀴즈 제출 실패');
    }
});

// Vercel deployment requires the handler to be exported
module.exports = server;

// Local development server setup

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});