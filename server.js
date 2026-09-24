const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" } // 允許跨網域連線
});

const rooms = {}; // 儲存所有房間狀態

// 產生隨機數學題
function generateQuestion(diff) {
  let num1, num2, op, answer;
  if (diff == 1) {
    op = Math.random() > 0.5 ? '+' : '-';
    if (op === '+') {
      num1 = Math.floor(Math.random() * 15) + 1;
      num2 = Math.floor(Math.random() * 15) + 1;
      answer = num1 + num2;
    } else {
      num1 = Math.floor(Math.random() * 20) + 5;
      num2 = Math.floor(Math.random() * num1) + 1;
      answer = num1 - num2;
    }
  } else {
    num1 = Math.floor(Math.random() * 10) + 2;
    num2 = Math.floor(Math.random() * 10) + 2;
    op = '×';
    answer = num1 * num2;
  }
  return { text: `${num1} ${op} ${num2} = ?`, answer };
}

io.on('connection', (socket) => {
  console.log('玩家已連線:', socket.id);

  // 1. 建立或加入房間
  socket.on('joinRoom', ({ roomId, difficulty, targetGoal }) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: [],
        difficulty: difficulty || 1,
        targetGoal: targetGoal || 5,
        scores: {},
        currentQuestion: null
      };
    }

    const room = rooms[roomId];
    if (room.players.length < 2) {
      room.players.push(socket.id);
      room.scores[socket.id] = 0;
    }

    // 當房內滿 2 人，遊戲開始
    if (room.players.length === 2) {
      const p1 = room.players[0];
      const p2 = room.players[1];

      // 通知 P1 與 P2 它們各自的角色身分
      io.to(p1).emit('initPlayerRole', { role: 'p1', opponentId: p2 });
      io.to(p2).emit('initPlayerRole', { role: 'p2', opponentId: p1 });

      // 出第一題
      room.currentQuestion = generateQuestion(room.difficulty);
      io.to(roomId).emit('gameStart', {
        question: room.currentQuestion,
        targetGoal: room.targetGoal
      });
    }
  });

  // 2. 處理玩家提交答案
  socket.on('submitAnswer', ({ roomId, answer }) => {
    const room = rooms[roomId];
    if (!room || !room.currentQuestion) return;

    // 比對答案（轉為數字）
    if (parseInt(answer, 10) === room.currentQuestion.answer) {
        // 增加該玩家的分數
        room.scores[socket.id] = (room.scores[socket.id] || 0) + 1;

        // 廣播給房間內所有人：更新分數與水位
        io.to(roomId).emit('playerScored', {
            winnerSocketId: socket.id,
            scores: room.scores
        });

        // 檢查是否達到目標勝出題數
        if (room.scores[socket.id] >= room.targetGoal) {
            io.to(roomId).emit('gameOver', { winnerSocketId: socket.id });
            delete rooms[roomId]; // 遊戲結束，清理房間資料
        } else {
            // 出下一題
            room.currentQuestion = generateQuestion(room.difficulty);
            io.to(roomId).emit('nextQuestion', { question: room.currentQuestion });
        }
    } else {
        socket.emit('wrongAnswer');
    }
});

  // 3. 斷線處理
  socket.on('disconnect', () => {
    console.log('玩家已離線:', socket.id);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.players.includes(socket.id)) {
        io.to(roomId).emit('opponentLeft');
        delete rooms[roomId];
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
