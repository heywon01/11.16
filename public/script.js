const API_BASE_URL = window.location.origin;
const SOCKET_SERVER_URL = "https://socket-l4t0.onrender.com";
const socket = io(SOCKET_SERVER_URL);
let allProblems = [];
let problems = [];
let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {

    const screens = {
        nameInput: document.getElementById('name-input-screen'),
        login: document.getElementById('login-screen'), 
        signup: document.getElementById('signup-screen'),
        main: document.getElementById('main-app-screen'),
    };
    const mainViews = {
        problems: document.getElementById('problem-view'),
        users: document.getElementById('user-list-view'),
        addProblem: document.getElementById('add-problem-view'),
        account: document.getElementById('account-view'),
    };
    const nameInputForm = document.getElementById('name-input-form');
    
    const problemModal = document.getElementById('problem-modal');
    const addProblemForm = document.getElementById('add-problem-form');
    const accountEditForm = document.getElementById('account-edit-form');
    const adminAuthModal = document.getElementById('admin-auth-modal');
    const adminAuthForm = document.getElementById('admin-auth-form');
    // index.html에 정의된 DOM 요소들
    const closeModalBtn = document.getElementById('close-modal-btn');
    const modalProblemContent = document.getElementById('modal-problem-content');
    const modalOptionsContainer = document.getElementById('modal-options-container');
    const modalFeedback = document.getElementById('modal-feedback');
    const modalSolversList = document.getElementById('modal-solvers-list');
    const modalSolversUl = modalSolversList.querySelector('ul');
    const solverCountDisplay = document.getElementById('solver-count');

    let currentProblem = null;
    
    // **2. Custom Modal DOM 요소 선택**
    const customModal = {
        overlay: document.getElementById('custom-modal-overlay'),
        message: document.getElementById('custom-modal-message'),
        okBtn: document.getElementById('custom-modal-ok'),
        cancelBtn: document.getElementById('custom-modal-cancel'),
    };
    
    // **3. 화면 전환 함수 정의 (초기화 로직보다 먼저)**
    const showScreen = (screenName) => {
        Object.values(screens).forEach(screen => screen.classList.add('hidden'));
        screens[screenName].classList.remove('hidden');
    };
    
    const showMainView = (viewName) => {
        Object.values(mainViews).forEach(view => view.classList.add('hidden'));
        mainViews[viewName].classList.remove('hidden');
    };
    
    // 관리자 화면 요소 표시/숨김
    const updateAdminUI = () => {
        const adminButton = document.getElementById('nav-add-problem');
        const adminAuthButton = document.getElementById('nav-admin-auth');
        
        if (currentUser && currentUser.isAdmin) {
            adminButton.classList.remove('hidden');
            adminAuthButton.classList.add('hidden'); 
        } else {
            adminButton.classList.add('hidden');
            adminAuthButton.classList.remove('hidden'); 
        }
    };
    
    // **4. 로딩 오버레이 제어 (유틸리티 함수 정의)**
    const loadingOverlay = document.getElementById('loading-overlay');
    const showLoading = () => { loadingOverlay ? loadingOverlay.classList.remove('hidden') : null; };
    const hideLoading = () => { loadingOverlay ? loadingOverlay.classList.add('hidden') : null; };

    // API 통신 기본 경로 설정
    const API_BASE_URL = '/api';

    // ===== 상태 관리 (State Management) =====
    let users = [];
    // problems, allProblems, currentUser는 최상단에 전역 변수로 선언되어 있습니다.

    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
        try {
            currentUser = JSON.parse(storedUser);
            showScreen('main');
            updateAdminUI();
            fetchProblems().then(() => {
                const today = new Date();
                renderCalendar(today.getFullYear(), today.getMonth());
            });
            fetchUsers();
        } catch (e) {
            console.error("Failed to parse stored user data:", e);
            localStorage.removeItem('currentUser');
        }
    }

    socket.on('connect', () => {
        console.log('Socket.IO 서버에 연결되었습니다. ID:', socket.id);
    });

    socket.on('new_problem', (newProblemData) => {
        console.log('실시간 업데이트: 새로운 문제가 도착했습니다.', newProblemData);

        try {
            // question 필드를 JSON 문자열에서 객체로 파싱
            const parsedProblem = {
                ...newProblemData,
                question: typeof newProblemData.question === 'string' 
                    ? JSON.parse(newProblemData.question) 
                    : newProblemData.question
            };
            // 최신 문제를 가장 앞에 추가
            problems.unshift(parsedProblem);
            allProblems.unshift(parsedProblem);
            renderProblemCards(allProblems);
        
        // 캘린더도 업데이트
            const today = new Date();
            renderCalendar(today.getFullYear(), today.getMonth());

            } catch (e) {
            console.error("실시간 문제 데이터 파싱 오류:", e);
        }
    });

    // ===== 유틸리티 함수 =====
    const showCustomAlert = (message) => {
        return new Promise((resolve) => {
            customModal.message.textContent = message;
            customModal.cancelBtn.classList.add('hidden');
            customModal.overlay.classList.remove('hidden');

            const okListener = () => {
                customModal.overlay.classList.add('hidden');
                customModal.okBtn.removeEventListener('click', okListener);
                resolve();
            };
            customModal.okBtn.addEventListener('click', okListener);
        });
    };

    const showCustomConfirm = (message) => {
        return new Promise((resolve) => {
            customModal.message.textContent = message;
            customModal.cancelBtn.classList.remove('hidden');
            customModal.overlay.classList.remove('hidden');
            
            const cleanup = () => {
                customModal.okBtn.removeEventListener('click', okListener);
                customModal.cancelBtn.removeEventListener('click', cancelListener);
            }
            
            const okListener = () => {
                customModal.overlay.classList.add('hidden');
                cleanup();
                resolve(true);
            };

            const cancelListener = () => {
                customModal.overlay.classList.add('hidden');
                cleanup();
                resolve(false);
            };
            
            customModal.okBtn.addEventListener('click', okListener);
            customModal.cancelBtn.addEventListener('click', cancelListener);
        });
    };
    
    const readFileAsDataURL = (file) => {
        return new Promise((resolve, reject) => {
            if (!file) {
                resolve("");
                return;
            }
            // 5MB 제한 (Base64 인코딩 시 약 6.7MB)
            if (file.size > 5 * 1024 * 1024) { 
                 reject(new Error('파일 크기가 5MB를 초과할 수 없습니다.'));
                 return;
            }
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };
    
    // **[API]** 모든 문제 데이터를 서버에서 가져옵니다.
    const fetchProblems = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/problems`);
            if (!response.ok) {
                throw new Error('문제 목록 로드 실패');
            }
            const fetchedProblems = await response.json();

            if (!Array.isArray(fetchedProblems)) { 
                console.error("서버에서 올바른 문제 목록을 받지 못했습니다.", fetchedProblems);
                return; // 배열이 아니면 함수를 여기서 중단 
            }

            // 문제 데이터 파싱: question 필드가 문자열인 경우 객체로 변환
            const parsedProblems = fetchedProblems.map(problem => {
                 try {
                    const questionObj = (typeof problem.question === 'string') 
                        ? JSON.parse(problem.question || '{}') 
                        : (problem.question || {});
                    return { ...problem, question: questionObj };
                } catch (e) {
                    console.error("문제 데이터 파싱 오류:", e);
                    return problem; // 파싱 실패 시 원본 데이터 유지
                }
            });

            problems = parsedProblems; 
            allProblems = parsedProblems;
            renderProblemCards(problems);

        } catch (error) {
            console.error('문제 목록 로드 실패:', error);
            await showCustomAlert('문제 목록 로드에 실패했습니다.');
        }
    };

    function renderProblemCards(problems) {
        const container = document.getElementById('problem-cards-container');
        if (!container) return; 

        // 모든 HTML을 새로 생성하여 문제 목록을 업데이트합니다.
        container.innerHTML = problems.map(problem => {
            // question 필드가 이미 파싱된 객체라고 가정합니다.
            const questionObj = problem.question || {}; 

            const questionText = questionObj.text || '문제 내용 없음';
            const dateString = new Date(problem.createdAt).toLocaleDateString('ko-KR');
            const isSolved = problem.solvers.some(s => s.userId === currentUser?._id);
            const solverCount = problem.solvers.length;
            const problemId = problem._id;

            return `
                <div class="problem-card bg-white p-6 rounded-xl shadow-md border ${isSolved ? 'border-green-400' : 'border-gray-200'} cursor-pointer hover:shadow-lg transition duration-300" 
                    data-id="${problemId}" data-date="${problem.date}">
                    <div class="flex justify-between items-start mb-3">
                        <span class="text-sm font-medium text-indigo-600">${dateString}</span>
                        <span class="text-xs font-semibold text-gray-500">${solverCount}명 풀이</span>
                    </div>
                    <h4 class="text-lg font-bold mb-3 line-clamp-2">${questionText}</h4>
                    ${questionObj.image ? `<img src="${questionObj.image}" alt="문제 이미지" class="max-h-24 object-contain mb-3 rounded-lg">` : ''}
                    ${isSolved
                        ? `<span class="inline-flex items-center px-3 py-1 text-sm font-bold rounded-full bg-green-100 text-green-800">✅ 완료</span>`
                        : `<span class="inline-flex items-center px-3 py-1 text-sm font-bold rounded-full bg-indigo-100 text-indigo-800">➡️ 풀기</span>`}
                </div>
            `;
        }).join('');

        // 새로 생성된 카드에 이벤트 리스너를 다시 붙입니다.
        attachProblemCardListeners(); 
    }

    // **[API]** 모든 사용자 데이터를 서버에서 가져옵니다.
    const fetchUsers = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/users`);
            if (!response.ok) {
                throw new Error('사용자 목록 로드 실패');
            }
            users = await response.json();
        } catch (error) {
            console.error('Error fetching users:', error);
        }
    };
    
    // **[API]** 현재 사용자 정보를 서버에서 최신화 (점수 관련 필터링)
    const updateCurrentUser = async () => {
        if (!currentUser || !currentUser._id) return;
        try {
             const response = await fetch(`${API_BASE_URL}/users/${currentUser._id}`);
             if (response.ok) {
                 const userData = await response.json();
                 // 서버에서 받은 최신 정보로 덮어쓰기 (isAdmin 등)
                 currentUser = { ...currentUser, ...userData }; 
                 localStorage.setItem('currentUser', JSON.stringify(currentUser));
                 document.getElementById('user-name-display').textContent = currentUser.name;
                 updateAdminUI();
             }
        } catch (error) {
            console.error('Error updating current user:', error);
        }
    }

    // ===== 렌더링 함수 =====
    
    const renderProblems = () => {
        // 이 함수는 'problem-view'가 로드될 때 사용자가 문제를 직접 클릭하지 않고 전체 목록을 볼 때 사용됩니다.
        const container = document.getElementById('problem-cards-container');
        if (!container) return; 
        
        container.innerHTML = '';
        if (problems.length === 0) {
            container.innerHTML = `<p class="text-gray-500 col-span-full text-center">아직 등록된 문제가 없습니다.</p>`;
            return;
        }

        // date 기준 내림차순 정렬 (최신 문제가 위로)
        problems.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // renderProblemCards 함수를 호출하여 실제 렌더링을 위임합니다.
        renderProblemCards(problems);
    };


    const attachProblemCardListeners = () => {
        document.querySelectorAll('.problem-card').forEach(card => {
            // 기존 리스너를 제거하여 중복 방지
            card.removeEventListener('click', handleProblemCardClick); 
            card.addEventListener('click', handleProblemCardClick);
        });
    };

    const handleProblemCardClick = (e) => {
        // 삭제 버튼 클릭은 제외
        if (e.target.closest('.delete-problem-btn')) return;
        
        const card = e.currentTarget;
        const problemId = card.dataset.id; 
        
        if (problemId) {
            openProblemModalById(problemId);
        }
    };
    
    // **[수정 없음]** 풀이 사용자 목록 렌더링
    const renderSolvers = (solvers) => {
        modalSolversUl.innerHTML = '';
        if (solvers && solvers.length > 0) {
            modalSolversList.classList.remove('hidden');
            
            // 사용자 데이터를 기준으로 이름 찾기 (users 배열 사용)
            solvers.forEach((solver) => {
                const userName = users.find(u => u._id === solver.userId)?.name || '알 수 없는 사용자';
                
                const li = document.createElement('li');
                li.className = 'text-sm text-gray-700 inline-block bg-gray-200 px-3 py-1 rounded-full mr-2 mb-2';
                li.textContent = userName;
                modalSolversUl.appendChild(li);
            });
            solverCountDisplay.textContent = `${solvers.length}명 풀이`;
        } else {
            modalSolversList.classList.add('hidden');
            solverCountDisplay.textContent = `0명 풀이`;
        }
    };

    //문제 모달 열기 및 선택지 렌더링
    const openProblemModalById = async (problemId) => {
        if (!currentUser) {
            await showCustomAlert('로그인 후 이용 가능합니다.');
            return;
        }
        
        const problem = allProblems.find(p => p._id === problemId); 
        
        if (!problem) {
            await showCustomAlert('문제를 찾을 수 없습니다.');
            return;
        }

        currentProblem = problem;
        const questionObj = problem.question || {}; // 이미 파싱된 객체 사용

        // 1. 문제 내용 렌더링
        modalProblemContent.innerHTML = `
            <h3 class="text-xl font-bold mb-3">${questionObj.text || '이미지 문제'}</h3>
            ${questionObj.image ? `<img src="${questionObj.image}" alt="문제 이미지" class="w-full max-h-60 object-contain mb-4 rounded-lg">` : ''}
        `;
        
        // 모달 초기 상태 설정
        modalOptionsContainer.innerHTML = '';
        modalFeedback.innerHTML = ''; 
        
        // 2. 선택지 렌더링 및 이벤트 처리
        const options = questionObj.options || [];
        const isUserSolved = problem.solvers.some(s => s.userId === currentUser._id);
        const correctOption = questionObj.answer ? questionObj.answer.toString() : null;
        
        options.forEach((option, index) => {
            const optionNum = index + 1;
            const optionElement = document.createElement('div');
            optionElement.className = 'option-item p-4 rounded-lg cursor-pointer transition-all duration-200 shadow-sm';
            optionElement.dataset.optionNumber = optionNum;
            
            let feedbackClass = 'bg-gray-100 hover:bg-indigo-100'; // 기본 클래스
            
            if (isUserSolved) {
                // 이미 푼 경우: 정답에 대한 피드백 제공
                if (optionNum.toString() === correctOption) {
                    feedbackClass = 'bg-green-300 hover:bg-green-300 ring-2 ring-green-500'; // 정답 배경
                    optionElement.innerHTML += `<span class="float-right text-green-700 font-bold">✅ 정답</span>`;
                } else if (problem.solvers.find(s => s.userId === currentUser._id && s.selectedOption.toString() === optionNum.toString())) {
                    // 사용자가 선택했지만 오답인 경우 (선택은 했으나 정답이 아님)
                    feedbackClass = 'bg-red-200 opacity-70';
                    optionElement.innerHTML += `<span class="float-right text-red-700 font-bold">❌ 내 선택</span>`;
                } else {
                    feedbackClass = 'bg-gray-100 opacity-50'; // 그 외 선택지
                }
            } else {
                // 안 푼 경우: 클릭 이벤트 추가
                optionElement.addEventListener('click', () => submitAnswer(problemId, optionNum));
            }
            
            optionElement.className += ' ' + feedbackClass;
            
            optionElement.innerHTML = `
                <div class="font-bold mb-1">${optionNum}. ${option.text || '선택지'}</div>
                ${option.image ? `<img src="${option.image}" alt="선택지 이미지" class="max-h-20 object-contain mt-2 rounded-lg">` : ''}
                ${optionElement.innerHTML}
            `;
            modalOptionsContainer.appendChild(optionElement);
        });
        
        // 3. 풀이 사용자 목록 갱신 및 표시
        renderSolvers(problem.solvers);
        
        // 4. 모달 열기
        problemModal.classList.remove('hidden'); 
    };
    
    // **[수정]** 정답 제출 API 로직 (점수 관련 로직 제거)
    const submitAnswer = async (problemId, selectedOption) => {
        if (!currentUser) {
            await showCustomAlert('로그인 후 이용 가능합니다.');
            return;
        }
        
        const problem = allProblems.find(p => p._id === problemId);
        if (!problem || problem.solvers.some(s => s.userId === currentUser._id)) {
            await showCustomAlert('이미 풀이한 문제입니다.');
            openProblemModalById(problemId); // 이미 풀었다면 정답 표시를 위해 모달 재렌더링
            return;
        }

        showLoading();

        try {
            const response = await fetch(`${API_BASE_URL}/problems/${problemId}/solve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    userId: currentUser._id, 
                    selectedOption: selectedOption // 숫자 또는 문자열
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || '정답 제출 실패');
            }

            // 서버 응답에서 점수 관련 필드 제거 (클라이언트 측에서만)
            const result = await response.json(); // { isCorrect: boolean, updatedProblem: object }
            
            // 문제 목록 업데이트 (서버 응답 사용)
            const problemIndex = allProblems.findIndex(p => p._id === problemId);
            if (problemIndex !== -1) {
                allProblems[problemIndex] = result.updatedProblem;
            }
            
            // UI 피드백 (점수 획득 메시지 제거)
            if (result.isCorrect) {
                modalFeedback.textContent = `정답`;
                modalFeedback.className = 'text-green-600 font-bold p-3 bg-green-100 rounded-lg mt-3 text-center';
                // 점수 갱신 로직 제거
            } else {
                modalFeedback.textContent = '오답';
                modalFeedback.className = 'text-red-600 font-bold p-3 bg-red-100 rounded-lg mt-3 text-center';
            }
            
            // 모달 UI 재렌더링 (정답/오답 표시 업데이트)
            openProblemModalById(problemId);
            renderProblemCards(allProblems); // 메인 카드 목록 업데이트
            const today = new Date();
            renderCalendar(today.getFullYear(), today.getMonth()); // 캘린더 업데이트

        } catch (error) {
            console.error('정답 제출 오류:', error);
            await showCustomAlert(error.message || '정답 제출 중 오류가 발생했습니다.');
        } finally {
            hideLoading();
        }
    };


    // **[수정]** 사용자 목록 렌더링 (점수 및 순위 로직 제거)
    const renderUsers = () => {
        const container = document.getElementById('user-list-container');
        container.innerHTML = '';
        // 이름 기준 오름차순 정렬
        users.sort((a, b) => a.name.localeCompare(b.name)).filter(u => !u.isAdmin).forEach((user, index) => { 
            const li = document.createElement('li');
            li.className = 'bg-gray-50 p-4 rounded-lg flex justify-start items-center'; 
            
            li.innerHTML = `
                <div class="flex items-center">
                    <span class="mr-2 text-gray-500 font-medium">${index + 1}.</span>
                    <span class="font-semibold text-lg">${user.name}</span>
                </div>
            `;
            container.appendChild(li);
        });
        
         if (users.filter(u => !u.isAdmin).length === 0) {
             container.innerHTML = '<p class="text-gray-500 text-center p-4">등록된 사용자가 없습니다.</p>';
         }
    };
    
    // **[수정 없음]** 캘린더 렌더링
    const renderCalendar = (year, month) => {
         const container = document.getElementById('calendar-container');
         container.innerHTML = '';
         const calendarProblemsDisplay = document.getElementById('calendar-problems-display');
         calendarProblemsDisplay.innerHTML = '';
         
         const date = new Date(year, month);
         
         const header = document.createElement('div');
         header.className = 'flex justify-between items-center mb-4';
         header.innerHTML = `
             <button id="prev-month" class="p-2 rounded-full hover:bg-gray-200">&lt;</button>
             <h4 class="text-xl font-bold">${year}년 ${month + 1}월</h4>
             <button id="next-month" class="p-2 rounded-full hover:bg-gray-200">&gt;</button>
           `;
         container.appendChild(header);
         
         document.getElementById('prev-month').addEventListener('click', () => renderCalendar(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1));
         document.getElementById('next-month').addEventListener('click', () => renderCalendar(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1));

         const table = document.createElement('table');
         table.className = 'w-full text-center';
         table.innerHTML = `
             <thead>
                 <tr>
                     ${['일', '월', '화', '수', '목', '금', '토'].map(day => `<th class="py-2 text-sm text-gray-500">${day}</th>`).join('')}
                 </tr>
             </thead>
             <tbody></tbody>
           `;
         container.appendChild(table);

         const tbody = table.querySelector('tbody');
         const firstDay = new Date(year, month, 1).getDay();
         const lastDate = new Date(year, month + 1, 0).getDate();
         
         let dateNum = 1;
         for (let i = 0; i < 6; i++) {
             const row = document.createElement('tr');
             for (let j = 0; j < 7; j++) {
                 const cell = document.createElement('td');
                 cell.className = 'p-1';
                 if (i === 0 && j < firstDay) {
                     // pass
                 } else if (dateNum > lastDate) {
                     // pass
                 } else {
                     const cellDate = new Date(year, month, dateNum);
                     // 서버와 동일한 YYYY-MM-DD 형식 사용
                     const dateStr = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, '0')}-${String(cellDate.getDate()).padStart(2, '0')}`;
                     const hasProblem = problems.some(p => p.date === dateStr);
                     
                     let statusClass = 'hover:bg-gray-200';
                     let problemId = null;
                     
                     if (hasProblem) {
                         const problem = problems.find(p => p.date === dateStr);
                         problemId = problem._id; // 문제 ID 저장
                         const isSolved = problem.solvers.some(s => currentUser && currentUser._id && s.userId === currentUser._id);
                         if (isSolved) {
                             statusClass = 'bg-green-300 text-green-900 font-bold hover:bg-green-400';
                         } else {
                             statusClass = 'bg-indigo-200 text-indigo-800 font-bold hover:bg-indigo-300';
                         }
                     }

                     cell.innerHTML = `
                         <button data-date="${dateStr}" data-id="${problemId || ''}" class="w-10 h-10 rounded-full transition-colors duration-200 flex items-center justify-center ${statusClass} ${problemId ? 'has-problem' : ''}">
                             ${dateNum}
                         </button>
                       `;
                     dateNum++;
                 }
                 row.appendChild(cell);
             }
             tbody.appendChild(row);
             if (dateNum > lastDate) break;
         }
         
         tbody.querySelectorAll('button.has-problem').forEach(button => {
              button.addEventListener('click', (e) => {
                  const selectedId = e.currentTarget.dataset.id;
                  if (selectedId) {
                      openProblemModalById(selectedId);
                  }
              });
          });
          
         tbody.querySelectorAll('button[data-date]:not(.has-problem)').forEach(button => {
             button.addEventListener('click', (e) => {
                 const selectedDate = e.currentTarget.dataset.date;
                 const problemsForDate = problems.filter(p => p.date === selectedDate);
                 
                 calendarProblemsDisplay.innerHTML = `<h4 class="text-lg font-bold mt-4 mb-2">${selectedDate}의 문제</h4>`;
                 if (problemsForDate.length > 0) {
                     const list = document.createElement('ul');
                     list.className = 'space-y-2';
                     problemsForDate.forEach(p => {
                        const li = document.createElement('li');
                        li.className = 'p-3 bg-gray-100 rounded-md cursor-pointer hover:bg-gray-200';
                        const questionText = p.question?.text || '이미지 문제';
                        const isSolved = p.solvers.some(s => currentUser && currentUser._id && s.userId === currentUser._id);
                        const statusBadge = isSolved 
                            ? '<span class="ml-2 text-green-600 font-semibold">(완료)</span>' 
                            : '<span class="ml-2 text-red-500 font-semibold">(미완료)</span>';
                            
                        li.innerHTML = `${questionText}${statusBadge}`;
                        li.addEventListener('click', () => openProblemModalById(p._id));
                        list.appendChild(li);
                     });
                     calendarProblemsDisplay.appendChild(list);
                 } else {
                     calendarProblemsDisplay.innerHTML += `<p class="text-gray-500">이 날짜에는 문제가 없습니다.</p>`;
                 }
             });
         });
    };


    // ===== 이벤트 핸들러 (API 호출 포함) =====
    
    // **[수정 없음]** 모달 닫기 버튼 이벤트
    closeModalBtn.addEventListener('click', () => {
        problemModal.classList.add('hidden');
        currentProblem = null;
    });

    // **[API]** 이름 입력 처리 (로그인/등록)
    nameInputForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('user-name').value.trim();

        if (name.length < 1) {
            showCustomAlert('이름을 입력해주세요.');
            return;
        }

        showLoading(); 

        try {
            const response = await fetch(`${API_BASE_URL}/users/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || '로그인/등록 실패');
            }

            currentUser = await response.json(); 
            localStorage.setItem('currentUser', JSON.stringify(currentUser)); 
            
            document.getElementById('user-name-display').textContent = currentUser.name;
            updateAdminUI(); 
            
            // 데이터 로드
            await fetchUsers(); 
            await fetchProblems(); // fetchProblems에서 renderProblemCards 호출
            
            showScreen('main');
            showMainView('problems');
            const today = new Date();
            renderCalendar(today.getFullYear(), today.getMonth());
            nameInputForm.reset();

        } catch (error) {
            console.error('로그인/등록 오류:', error);
            await showCustomAlert(`로그인/등록 실패: ${error.message}`);
        } finally {
            hideLoading(); 
        }
    });

    // **[수정 없음]** 로그아웃 처리
    document.getElementById('logout-button').addEventListener('click', () => {
        currentUser = null;
        localStorage.removeItem('currentUser');
        showScreen('nameInput'); 
    });

    // **[API]** 관리자 인증 폼 제출 처리
    adminAuthForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('admin-id').value;
        const password = document.getElementById('admin-password').value;
        const errorMsg = document.getElementById('admin-auth-error');

        showLoading(); 

        try {
            const response = await fetch(`${API_BASE_URL}/admin/auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, password, currentUserId: currentUser._id }) 
            });

            if (response.ok) {
                const adminData = await response.json();
                currentUser = { ...currentUser, ...adminData }; 
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                
                adminAuthModal.classList.add('hidden');
                updateAdminUI(); 
                await showCustomAlert('관리자 인증이 완료되었습니다.');
                renderProblems(); 
                errorMsg.classList.add('hidden');
            } else {
                const errorText = await response.text();
                errorMsg.textContent = errorText || 'ID 또는 비밀번호가 일치하지 않습니다.';
                errorMsg.classList.remove('hidden');
            }

        } catch (error) {
            console.error('관리자 인증 오류:', error);
            errorMsg.textContent = '인증 중 오류가 발생했습니다.';
            errorMsg.classList.remove('hidden');
        } finally {
             hideLoading(); 
        }
    });

    document.getElementById('cancel-admin-auth').addEventListener('click', () => adminAuthModal.classList.add('hidden'));
    document.getElementById('nav-admin-auth').addEventListener('click', () => {
        if (!currentUser) {
            showCustomAlert('먼저 로그인 해주세요.');
            return;
        }
        adminAuthModal.classList.remove('hidden');
        document.getElementById('admin-auth-error').classList.add('hidden');
        adminAuthForm.reset();
    });

    // 네비게이션
    document.getElementById('nav-problems').addEventListener('click', async () => {
        showLoading();
        await fetchProblems();
        showMainView('problems');
        const today = new Date();
        renderCalendar(today.getFullYear(), today.getMonth());
        hideLoading();
    });
    document.getElementById('nav-users').addEventListener('click', async () => {
        showLoading();
        await fetchUsers();
        showMainView('users');
        renderUsers();
        hideLoading();
    });
    document.getElementById('nav-add-problem').addEventListener('click', () => {
        if (!currentUser || !currentUser.isAdmin) {
             showCustomAlert('관리자만 접근 가능합니다.');
             return;
        }
        showMainView('addProblem');
        resetAddProblemForm();
    });
    document.getElementById('nav-edit-account').addEventListener('click', () => {
        showMainView('account');
        document.getElementById('edit-name').value = currentUser.name;
    });

    // **[API]** 계정 정보 수정 (이름 변경)
    accountEditForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newName = document.getElementById('edit-name').value;
        
        if (newName === currentUser.name) {
             showMainView('problems');
             return;
        }

        showLoading();

        try {
            const response = await fetch(`${API_BASE_URL}/users/${currentUser._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || '이름 변경 실패');
            }
            
            const updatedUser = await response.json();

            currentUser.name = updatedUser.name;
            document.getElementById('user-name-display').textContent = currentUser.name;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            await showCustomAlert('이름이 변경되었습니다.');
            showMainView('problems');

        } catch (error) {
            console.error('계정 정보 수정 오류:', error);
            await showCustomAlert(error.message || '이름 변경 중 오류 발생');
        } finally {
            hideLoading();
        }
    });
    document.getElementById('cancel-edit-account').addEventListener('click', () => showMainView('problems'));

    // **[API]** 문제 삭제 처리
    document.getElementById('problem-cards-container').addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-problem-btn');
        if (deleteBtn) {
            e.stopPropagation();
            if (!currentUser || !currentUser.isAdmin) {
                 await showCustomAlert('관리자만 문제를 삭제할 수 있습니다.');
                 return;
            }
            // 문제 ID는 'problem-card'의 data-id에 저장되어 있으므로, 
            // 삭제 버튼에서 가장 가까운 .problem-card를 찾아 ID를 가져와야 합니다.
            const problemCard = e.target.closest('.problem-card');
            const problemId = problemCard ? problemCard.dataset.id : null;
            
            if (!problemId) {
                console.error("삭제할 문제 ID를 찾을 수 없습니다.");
                return;
            }
            
            const confirmed = await showCustomConfirm(`문제를 삭제하시겠습니까?`);
            
            if (confirmed) {
                showLoading(); 
                try {
                    const response = await fetch(`${API_BASE_URL}/problems/id/${problemId}`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(errorText || '문제 삭제 실패');
                    }
                    
                    // 삭제 성공 후 목록 갱신
                    await fetchProblems(); 
                    const today = new Date();
                    renderCalendar(today.getFullYear(), today.getMonth());
                    await showCustomAlert('문제가 삭제되었습니다.');
                    
                } catch (error) {
                     console.error('문제 삭제 오류:', error);
                     await showCustomAlert(error.message || '문제 삭제 중 오류 발생');
                } finally {
                    hideLoading(); 
                }
            }
        }
    });

    // **[수정 없음]** 문제 추가 폼 관련 유틸리티 함수
    const optionsContainer = document.getElementById('options-container');
    const addOptionBtn = document.getElementById('add-option-btn');
    let optionCount = 0;

    const createOptionInput = (isFirst = false) => {
        optionCount++;
        const div = document.createElement('div');
        div.className = 'flex items-start space-x-2 p-3 bg-gray-50 rounded-lg';
        div.innerHTML = `
            <input type="radio" name="correct-option" value="${optionCount}" class="form-radio h-5 w-5 text-indigo-600 mt-2" required>
            <div class="flex-grow space-y-2">
                <input type="text" class="option-text w-full border border-gray-300 rounded-md p-2" placeholder="선택지 내용 (글)">
                <input type="file" class="option-image-upload w-full text-sm text-gray-500 file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer" accept="image/*">
                <img class="option-image-preview hidden mt-1 rounded max-h-24" alt="선택지 이미지 미리보기">
            </div>
            ${!isFirst ? `<button type="button" class="remove-option-btn text-red-500 hover:text-red-700 p-1 mt-1">&times;</button>` : ''}
        `;
        optionsContainer.appendChild(div);
        
        div.querySelector('.remove-option-btn')?.addEventListener('click', () => div.remove());

        const fileInput = div.querySelector('.option-image-upload');
        const preview = div.querySelector('.option-image-preview');
        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    preview.src = e.target.result;
                    preview.classList.remove('hidden');
                };
                reader.readAsDataURL(file);
            } else {
                preview.classList.add('hidden');
                preview.src = '';
            }
        });
    };
    
    // 문제 추가 폼 초기화
    const resetAddProblemForm = () => {
        addProblemForm.reset();
        optionsContainer.innerHTML = '';
        optionCount = 0;
        createOptionInput(true);
        createOptionInput();
        document.getElementById('question-image-preview').classList.add('hidden');
        document.getElementById('question-image-preview').src = '';
    };

    // 문제 추가 버튼
    addOptionBtn.addEventListener('click', () => createOptionInput());

    // 문제 이미지 미리보기
    document.getElementById('problem-image-upload').addEventListener('change', (event) => {
        const file = event.target.files[0];
        const preview = document.getElementById('problem-image-preview');
        if (file) {
             const reader = new FileReader();
             reader.onload = (e) => {
                 preview.src = e.target.result;
                 preview.classList.remove('hidden');
             };
             reader.readAsDataURL(file);
        } else {
            preview.classList.add('hidden');
            preview.src = '';
        }
    });

    // **[API]** 문제 추가 폼 제출 처리
    addProblemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!currentUser || !currentUser.isAdmin) {
            await showCustomAlert('관리자 권한이 없습니다.');
            return;
        }

        showLoading();

        try {
            const date = document.getElementById('problem-date').value;
            const questionText = document.getElementById('question-text').value;
            const questionImageFile = document.getElementById('question-image-upload').files[0];
            const correctOptionValue = addProblemForm.elements['correct-option'].value;

            // 문제 이미지 업로드 및 Base64 변환
            const questionImageBase64 = await readFileAsDataURL(questionImageFile);

            const options = [];
            const optionElements = optionsContainer.querySelectorAll('.flex.items-start.space-x-2');
            
            for (let i = 0; i < optionElements.length; i++) {
                const element = optionElements[i];
                const text = element.querySelector('.option-text').value;
                const imageFile = element.querySelector('.option-image-upload').files[0];
                
                // 선택지 이미지 업로드 및 Base64 변환
                const imageBase64 = await readFileAsDataURL(imageFile);

                if (!text && !imageBase64) {
                    throw new Error(`${i + 1}번째 선택지 내용 또는 이미지를 입력해주세요.`);
                }
                
                options.push({ text, image: imageBase64 });
            }

            if (options.length < 2) {
                throw new Error('선택지는 최소 2개 이상이어야 합니다.');
            }
            
            const problemData = {
                date,
                question: {
                    text: questionText,
                    image: questionImageBase64,
                    options: options,
                    answer: correctOptionValue 
                },
                creatorId: currentUser._id
            };

            const response = await fetch(`${API_BASE_URL}/problems`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(problemData)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || '문제 등록 실패');
            }

            const newProblem = await response.json();
            
            resetAddProblemForm();
            await showCustomAlert('문제가 성공적으로 등록되었습니다.');
            showMainView('problems');
            
            // 등록 후 데이터 갱신
            await fetchProblems();
            const today = new Date();
            renderCalendar(today.getFullYear(), today.getMonth());


        } catch (error) {
            console.error('문제 등록 오류:', error);
            await showCustomAlert(`문제 등록 실패: ${error.message}`);
        } finally {
            hideLoading();
        }
    });
});