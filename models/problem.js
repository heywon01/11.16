const mongoose = require('mongoose');

const problemSchema = new mongoose.Schema({
    question: {
        type: String,
        required: true,
        trim: true
    },
    answer: {
        type: Number, // 정답은 숫자로 저장
        required: true
    },
    difficulty: {
        type: String,
        enum: ['easy', 'medium', 'hard'], // 난이도는 세 가지 중 하나여야 함
        default: 'easy'
    },
    creator: {
        type: String, // 문제를 등록한 관리자 ID
        required: false // 나중에 추가되거나 변경될 수 있음
    },
    // 이 문제를 푼 사용자들의 ID와 풀이 시간 기록
}, {
    timestamps: true
});

const Problem = mongoose.model('Problem', problemSchema);
module.exports = Problem;