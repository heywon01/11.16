const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true, // 사용자 이름은 중복될 수 없음
        trim: true
    },
    isAdmin: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true // 생성 및 업데이트 시간을 자동으로 기록
});

const User = mongoose.model('User', userSchema);
module.exports = User;