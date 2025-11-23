const API_BASE_URL = 'http://localhost:5001';
const SOCKET_SERVER_URL = "https://socket-l4t0.onrender.com";
const socket = io("https://socket-l4t0.onrender.com");
let allProblems = [];
let problems = [];
let users = []; // 사용자 목록을 저장하는 배열 추가
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
    // **[수정]** 이름 입력 폼을 가장 안전한 방식으로 직접 참조
    const nameInputForm = document.getElementById('name-input-form'); 
    
    const problemModal = document.getElementById('problem-modal');
    const addProblemForm = document.getElementById('add-problem-form');
    const accountEditForm = document.getElementById('account-edit-form');
    // const adminAuthModal = document.getElementById('admin-auth-modal'); // 사용하지 않으므로 제거
    // const adminAuthForm = document.getElementById('admin-auth-form');   // 사용하지 않으므로 제거

    // **[강화]** 사용자 관리 모달 관련 DOM 요소 (초기화는 그대로 두고 사용 시점에 if 검사)
    const userEditModal = document.getElementById('user-edit-modal');
    const userEditForm = document.getElementById('user-edit-form');
    const cancelEditUser = document.getElementById('cancel-edit-user');
    let editingUserId = null; // 수정 중인 사용자의 ID를 저장
    
    // index.html에 정의된 DOM 요소들
    const closeModalBtn = document.getElementById('close-modal-btn');
    const customAlertModal = document.getElementById('custom-alert-modal');
    const customAlertMessage = document.getElementById('custom-alert-message');
    const customAlertButton = document.getElementById('custom-alert-ok-btn'); 
    
    let currentProblem = null;
    let selectedDate = null; // 현재 캘린더에서 선택된 날짜 (문제 등록 시 사용)
    let problemsLoaded = false; // 문제 로딩 상태 플래그

    // **1. Custom Alert**
    const showCustomAlert = (message) => {
        return new Promise(resolve => {
            if (!customAlertModal || !customAlertMessage || !customAlertButton) {
                alert(message); // 최소한의 폴백
                return resolve();
            }

            customAlertMessage.textContent = message;
            customAlertModal.classList.remove('hidden');

            const resolveAlert = () => {
                customAlertModal.classList.add('hidden');
                customAlertButton.removeEventListener('click', resolveAlert);
                resolve();
            };
            customAlertButton.addEventListener('click', resolveAlert);
        });
    };

    // **2. View Management**
    const showScreen = (screenName) => {
        Object.values(screens).forEach(screen => {
            if (screen) screen.classList.add('hidden');
        });
        if (screens[screenName]) screens[screenName].classList.remove('hidden');
    };

    const showMainView = (viewName) => {
        // 네비게이션 탭 UI 업데이트
        document.querySelectorAll('.tab-button').forEach(btn => {
            if (btn.dataset.view === viewName) {
                btn.classList.add('text-indigo-600', 'border-indigo-600');
                btn.classList.remove('text-gray-700', 'hover:border-indigo-200');
            } else {
                btn.classList.remove('text-indigo-600', 'border-indigo-600');
                btn.classList.add('text-gray-700', 'hover:border-indigo-200');
            }
        });

        // 메인 뷰 내용 전환
        Object.values(mainViews).forEach(view => {
            if (view) view.classList.add('hidden');
        });
        if (mainViews[viewName]) mainViews[viewName].classList.remove('hidden');

        // 사용자 목록 뷰로 전환 시 데이터 로드 및 렌더링
        if (viewName === 'users') {
            fetchUsers().then(() => renderUsers());
        }
        // 계정 뷰로 전환 시 현재 이름 설정
        if (viewName === 'account' && currentUser) {
            document.getElementById('edit-name').value = currentUser.name;
        }
    };

    const showLoading = () => {
        const loadingModal = document.getElementById('loading-modal');
        if (loadingModal) loadingModal.classList.remove('hidden');
    };

    const hideLoading = () => {
        const loadingModal = document.getElementById('loading-modal');
        if (loadingModal) loadingModal.classList.add('hidden');
    };

    // **3. Auth & User Status**
    const updateAuthUI = () => {
        const currentUserNameDisplay = document.getElementById('current-user-name');

        if (currentUser) {
            showScreen('main');
            if (currentUserNameDisplay) currentUserNameDisplay.textContent = currentUser.name; 
            updateAdminUI();
            showMainView('problems');
        } else {
            showScreen('login');
        }
    };

    const updateAdminUI = () => {
        const adminElements = document.querySelectorAll('.admin-only');
        const adminTab = document.querySelector('[data-view="addProblem"]');
        
        if (currentUser && currentUser.isAdmin) {
            adminElements.forEach(el => el.classList.remove('hidden'));
            if(adminTab) adminTab.classList.remove('hidden');
        } else {
            adminElements.forEach(el => el.classList.add('hidden'));
            if(adminTab) adminTab.classList.add('hidden');
        }
    };

    const fetchUserStatus = async () => {
        const token = localStorage.getItem('token');
        if (token) {
            try {
                const response = await fetch(`${API_BASE_URL}/users/status`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.ok) {
                    const data = await response.json();
                    currentUser = data.user;
                    users = data.users; // 사용자 목록 초기 로드
                    localStorage.setItem('currentUser', JSON.stringify(currentUser));
                    updateAuthUI();
                    return true;
                } else {
                    localStorage.removeItem('token');
                    localStorage.removeItem('currentUser');
                }
            } catch (error) {
                console.error('Fetch user status error:', error);
                localStorage.removeItem('token');
                localStorage.removeItem('currentUser');
            }
        }
        currentUser = null;
        updateAuthUI();
        return false;
    };

    // **4. Data Fetching**
    const fetchProblems = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const response = await fetch(`${API_BASE_URL}/problems`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                allProblems = data.problems;
                problemsLoaded = true;
            }
        } catch (error) {
            console.error('문제 목록 로딩 오류:', error);
            await showCustomAlert('문제 목록을 불러오지 못했습니다.');
        }
    };

    const fetchUsers = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const response = await fetch(`${API_BASE_URL}/users`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                users = data.users;
            }
        } catch (error) {
            console.error('사용자 목록 로딩 오류:', error);
        }
    };
    
    // **5. Calendar & Problem Rendering**
    const renderCalendar = (year, month) => {
        const calendarBody = document.getElementById('calendar-body');
        const monthYearDisplay = document.getElementById('current-month-year'); 
        
        if (!calendarBody || !monthYearDisplay) return;

        monthYearDisplay.textContent = `${year}년 ${month + 1}월`;
        calendarBody.innerHTML = '';

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const calendarGrid = document.getElementById('calendar-grid');
        let dateGrid = document.createElement('div');
        dateGrid.className = 'grid grid-cols-7 gap-1 text-center'; 
        
        let date = 1;
        for (let i = 0; i < 6; i++) {
            for (let j = 0; j < 7; j++) {
                const cell = document.createElement('div');
                cell.className = 'p-1 border border-gray-200 align-top text-center cursor-pointer hover:bg-indigo-50 transition duration-150 h-20';

                if (i === 0 && j < firstDay) {
                    // 빈 셀
                    cell.innerHTML = '';
                } else if (date <= daysInMonth) {
                    const fullDate = new Date(year, month, date);
                    const dateString = fullDate.toISOString().split('T')[0];
                    cell.dataset.date = dateString;
                    
                    const problemsForDate = allProblems.filter(p => p.date === dateString);
                    
                    let content = `<div class="font-bold text-gray-700 mb-1">${date}</div>`;
                    
                    if (problemsForDate.length > 0) {
                        const solvedCount = problemsForDate.filter(p => p.solvers.includes(currentUser._id)).length;
                        const totalCount = problemsForDate.length;
                        
                        let solvedBadge = '';
                        if (solvedCount === totalCount && totalCount > 0) {
                             solvedBadge = `<span class="inline-block bg-green-500 text-white text-xs font-semibold px-2 rounded-full mt-1">완료</span>`;
                        } else if (solvedCount > 0 && solvedCount < totalCount) {
                             solvedBadge = `<span class="inline-block bg-yellow-500 text-gray-900 text-xs font-semibold px-2 rounded-full mt-1">${solvedCount}/${totalCount}</span>`;
                        } else if (totalCount > 0) {
                             solvedBadge = `<span class="inline-block bg-indigo-500 text-white text-xs font-semibold px-2 rounded-full mt-1">${totalCount}개</span>`;
                        }

                        content += solvedBadge;
                        
                        cell.addEventListener('click', () => showProblemModal(dateString));
                        
                    } else if (currentUser && currentUser.isAdmin) {
                        content += `<span class="text-xs text-gray-400 mt-1">문제 등록</span>`;
                        cell.addEventListener('click', () => prepareAddProblem(dateString));
                    } else {
                         cell.addEventListener('click', () => showCustomAlert('등록된 문제가 없습니다.'));
                    }

                    cell.innerHTML = content; 
                    date++;
                } else {
                    // 빈 셀
                    cell.innerHTML = '';
                }
                dateGrid.appendChild(cell);
            }
            if (date > daysInMonth) break;
        }

        // 캘린더 내용을 DOM에 삽입
        const existingDateGrid = calendarGrid.querySelector('.date-grid');
        if (existingDateGrid) {
            calendarGrid.removeChild(existingDateGrid);
        }
        dateGrid.classList.add('date-grid'); 
        calendarGrid.appendChild(dateGrid);

    };
    
    // **6. Problem Modal**
    const showProblemModal = (dateString) => {
        const problemsForDate = allProblems.filter(p => p.date === dateString);
        problems = problemsForDate; 
        currentProblem = problemsForDate[0]; 

        if (!currentProblem || !problemModal) {
            showCustomAlert('문제 데이터를 찾을 수 없습니다.');
            return;
        }
        
        renderModalContent(currentProblem, 0);

        problemModal.classList.remove('hidden');
    };

    const renderModalContent = (problem, problemIndex) => {
        const modalTitle = document.getElementById('modal-problem-header'); 
        const modalProblemContent = document.getElementById('modal-problem-content');
        const modalSolversList = document.getElementById('modal-solvers-list').querySelector('ul');
        const modalProblemFooter = document.getElementById('modal-problem-footer');
        
        if (!modalTitle || !modalProblemContent || !modalSolversList || !modalProblemFooter) return;

        // 제목
        modalTitle.textContent = `${problem.date} 문제 (${problemIndex + 1}/${problems.length})`;

        // 문제 내용
        let contentHTML = `
            <div class="text-lg font-medium">${problem.question.text}</div>
        `;
        if (problem.question.image) {
            contentHTML += `<div class="mt-4"><img src="${problem.question.image}" class="max-w-full h-auto rounded-lg shadow-md mx-auto" alt="문제 이미지"></div>`;
        }
        modalProblemContent.innerHTML = contentHTML;

        // 선택지 렌더링
        const isSolved = problem.solvers.includes(currentUser._id);
        const optionsHTML = problem.question.options.map((option, index) => {
            const isCorrect = isSolved && option.value === problem.question.answer;
            const isSelected = problem.userAnswer === option.value;
            let optionClass = 'bg-gray-100 hover:bg-gray-200 text-gray-800';

            if (isSolved) {
                if (isCorrect) {
                    optionClass = 'bg-green-100 text-green-800 border-green-500 border-2';
                } else if (isSelected) {
                    optionClass = 'bg-red-100 text-red-800 border-red-500 border-2';
                } else {
                    optionClass = 'bg-gray-100 text-gray-800';
                }
            }
            
            return `
                <button 
                    data-value="${option.value}"
                    class="block w-full text-left p-3 rounded-lg transition duration-150 ${optionClass} 
                    ${isSolved ? 'cursor-default' : 'solve-option-btn'}"
                    ${isSolved ? 'disabled' : ''}>
                    ${index + 1}. ${option.text}
                </button>
            `;
        }).join('');
        
        modalProblemContent.innerHTML += `<div class="space-y-3 mt-6">${optionsHTML}</div>`;


        // 정답자 목록 렌더링
        modalSolversList.innerHTML = '';
        problem.solvers.forEach(solverId => {
            const solver = users.find(u => u._id === solverId);
            if (solver) {
                const li = document.createElement('li');
                li.textContent = solver.name;
                modalSolversList.appendChild(li);
            }
        });
        
        // 푸터 (네비게이션 버튼 및 삭제 버튼)
        modalProblemFooter.innerHTML = '';
        const footerDiv = document.createElement('div');
        footerDiv.className = 'flex justify-between items-center';

        // 네비게이션 버튼
        let navButtonsHTML = '';
        if (problems.length > 1) {
            navButtonsHTML = `
                <div class="flex space-x-2">
                    <button id="prev-problem-btn" class="px-3 py-1 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition disabled:opacity-50" ${problemIndex === 0 ? 'disabled' : ''}>이전</button>
                    <button id="next-problem-btn" class="px-3 py-1 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition disabled:opacity-50" ${problemIndex === problems.length - 1 ? 'disabled' : ''}>다음</button>
                </div>
            `;
        } else {
            navButtonsHTML = '<div></div>'; 
        }
        
        // 문제 삭제 버튼 (관리자만)
        let deleteButtonHTML = '';
        if (currentUser && currentUser.isAdmin) {
             deleteButtonHTML = `<button id="delete-problem-btn" class="px-3 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 transition">문제 삭제</button>`;
        }

        footerDiv.innerHTML = navButtonsHTML + deleteButtonHTML;
        modalProblemFooter.appendChild(footerDiv);

        // 이벤트 리스너 등록/재등록
        document.querySelectorAll('.solve-option-btn').forEach(btn => {
            btn.addEventListener('click', handleSolveAttempt);
        });

        const prevBtn = document.getElementById('prev-problem-btn');
        const nextBtn = document.getElementById('next-problem-btn');
        if (prevBtn) prevBtn.addEventListener('click', () => navigateProblem(problemIndex - 1));
        if (nextBtn) nextBtn.addEventListener('click', () => navigateProblem(problemIndex + 1));
        
        const deleteBtn = document.getElementById('delete-problem-btn');
        if (deleteBtn) deleteBtn.addEventListener('click', handleDeleteProblem);
    };

    const navigateProblem = (newIndex) => {
        if (newIndex >= 0 && newIndex < problems.length) {
            currentProblem = problems[newIndex];
            renderModalContent(currentProblem, newIndex);
        }
    };
    
    // **7. Problem Solving**
    const handleSolveAttempt = async (e) => {
        const selectedValue = e.currentTarget.dataset.value;
        showLoading();

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_BASE_URL}/problems/${currentProblem._id}/solve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ answer: selectedValue })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || '문제 풀이 실패');
            }

            const result = await response.json();
            const updatedProblem = result.problem;
            const isCorrect = result.isCorrect;

            // 로컬 데이터 업데이트
            const globalIndex = allProblems.findIndex(p => p._id === updatedProblem._id);
            if (globalIndex !== -1) {
                allProblems[globalIndex] = updatedProblem;
            }
            const localIndex = problems.findIndex(p => p._id === updatedProblem._id);
            if (localIndex !== -1) {
                problems[localIndex] = updatedProblem;
                currentProblem = updatedProblem; 
            }

            // 모달 재렌더링
            const problemIndex = problems.findIndex(p => p._id === updatedProblem._id);
            renderModalContent(updatedProblem, problemIndex);
            
            await showCustomAlert(isCorrect ? '정답입니다! 🎉' : '오답입니다. 😥');

            // 캘린더 업데이트
            const date = new Date(updatedProblem.date);
            renderCalendar(date.getFullYear(), date.getMonth());


        } catch (error) {
            console.error('문제 풀이 오류:', error);
            await showCustomAlert(error.message || '문제 풀이 중 오류 발생');
        } finally {
            hideLoading();
        }
    };

    // **8. Problem Deletion**
    const handleDeleteProblem = async () => {
        if (!currentUser || !currentUser.isAdmin) {
             await showCustomAlert('관리자 권한이 필요합니다.');
             return;
        }

        await showCustomAlert('정말로 이 문제를 삭제하시겠습니까?');
        
        showLoading();

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_BASE_URL}/problems/${currentProblem._id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || '문제 삭제 실패');
            }
            
            // 로컬 데이터 업데이트
            allProblems = allProblems.filter(p => p._id !== currentProblem._id);
            
            if (problemModal) problemModal.classList.add('hidden'); 
            await showCustomAlert('문제가 성공적으로 삭제되었습니다.');

            // 캘린더 업데이트
            const date = new Date(currentProblem.date);
            renderCalendar(date.getFullYear(), date.getMonth());

        } catch (error) {
            console.error('문제 삭제 오류:', error);
            await showCustomAlert(`문제 삭제 실패: ${error.message}`);
        } finally {
            hideLoading();
        }
    };

    // **9. Add Problem View**
    const prepareAddProblem = (dateString) => {
        if (!currentUser || !currentUser.isAdmin) {
             showCustomAlert('문제 등록은 관리자만 가능합니다.');
             return;
        }
        selectedDate = dateString;
        const problemDateInput = document.getElementById('problem-date');
        if (problemDateInput) problemDateInput.value = dateString; 

        showMainView('addProblem');
        resetAddProblemForm();
    };

    const resetAddProblemForm = () => {
        if (addProblemForm) addProblemForm.reset();
        
        const optionsContainer = document.getElementById('options-container');
        const imagePreview = document.getElementById('image-preview'); 
        
        if (optionsContainer) optionsContainer.innerHTML = '';
        addOptionField(); // 기본 옵션 1개 추가 (이 함수에서 최소 2개 옵션이 되도록 처리)
        
        if (imagePreview) {
            imagePreview.src = '';
            imagePreview.classList.add('hidden');
        }
    };
    
    const addOptionField = () => {
        const optionsContainer = document.getElementById('options-container');
        if (!optionsContainer) return;

        const currentOptions = optionsContainer.querySelectorAll('.option-row');
        const optionValue = String.fromCharCode(65 + currentOptions.length); 
        
        const optionDiv = document.createElement('div');
        optionDiv.className = 'flex items-center space-x-2 option-row'; 
        optionDiv.innerHTML = `
            <input type="radio" name="correct-option" value="${optionValue}" required class="correct-option-radio h-4 w-4 text-green-600 border-gray-300 focus:ring-green-500">
            <input type="text" placeholder="선택지 ${currentOptions.length + 1}" data-value="${optionValue}" required class="option-input flex-grow px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500">
            <button type="button" class="remove-option-btn text-red-500 hover:text-red-700 p-1 rounded-full transition leading-none">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 10-2 0v6a1 1 0 102 0V8z" clip-rule="evenodd" /></svg>
            </button>
        `;
        optionsContainer.appendChild(optionDiv);

        // 이벤트 리스너 등록
        optionDiv.querySelector('.remove-option-btn').addEventListener('click', (e) => {
            if (optionsContainer.children.length > 2) { 
                optionsContainer.removeChild(optionDiv);
                updateOptionValues();
            } else {
                showCustomAlert('선택지는 최소 2개 이상이어야 합니다.');
            }
        });

        optionDiv.querySelector('.option-input').addEventListener('input', updateOptionValues);
        optionDiv.querySelector('.correct-option-radio').addEventListener('change', updateOptionValues);
    };

    const updateOptionValues = () => {
        const optionsContainer = document.getElementById('options-container');
        if (!optionsContainer) return;
        
        const optionRows = optionsContainer.querySelectorAll('.option-row');
        
        optionRows.forEach((row, index) => {
            const newOptionValue = String.fromCharCode(65 + index); 

            const radio = row.querySelector('input[type="radio"]');
            const textInput = row.querySelector('.option-input');
            
            if (radio) radio.value = newOptionValue;
            if (textInput) {
                textInput.dataset.value = newOptionValue;
                textInput.placeholder = `선택지 ${index + 1}`;
            }
        });
    };


    // ===== 사용자 목록 관리 함수 (User Management) =====

    const handleEditUserClick = (e) => {
        const userId = e.currentTarget.dataset.userId;
        const user = users.find(u => u._id === userId); 

        if (!user || !userEditModal) return;

        editingUserId = userId;
        document.getElementById('edit-user-name').value = user.name;
        document.getElementById('edit-user-admin').checked = user.isAdmin; 

        userEditModal.classList.remove('hidden');
    };

    const closeUserEditModal = () => {
        if (userEditModal) userEditModal.classList.add('hidden');
        if (userEditForm) userEditForm.reset();
        editingUserId = null;
    };

    const handleUserEditFormSubmit = async (e) => {
        e.preventDefault();

        if (!editingUserId) return;

        showLoading();

        try {
            const newName = document.getElementById('edit-user-name').value;
            const newIsAdmin = document.getElementById('edit-user-admin').checked;

            const response = await fetch(`${API_BASE_URL}/users/${editingUserId}/admin`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name: newName,
                    isAdmin: newIsAdmin,
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || '사용자 정보 수정 실패');
            }

            const updatedUser = await response.json();
            
            const userIndex = users.findIndex(u => u._id === editingUserId);
            if (userIndex !== -1) {
                users[userIndex] = updatedUser;
                if (currentUser && currentUser._id === editingUserId) {
                    currentUser = { ...currentUser, ...updatedUser }; 
                    localStorage.setItem('currentUser', JSON.stringify(currentUser));
                    const nameDisplay = document.getElementById('current-user-name');
                    if(nameDisplay) nameDisplay.textContent = currentUser.name;
                    updateAdminUI(); 
                }
            }

            closeUserEditModal();
            renderUsers(); 
            await showCustomAlert('사용자 정보가 수정되었습니다.');

        } catch (error) {
            console.error('사용자 정보 수정 오류:', error);
            await showCustomAlert(error.message || '사용자 정보 수정 중 오류 발생');
        } finally {
            hideLoading();
        }
    };
    
    const renderUsers = () => {
        const userListBody = document.getElementById('user-list-body'); 
        if (!userListBody) return; 

        userListBody.innerHTML = ''; 

        users.sort((a, b) => a.name.localeCompare(b.name)).forEach(user => { 
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50 transition duration-150';
            
            const nameCell = document.createElement('td');
            nameCell.className = 'px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900';
            
            let adminBadge = '';
            if (user.isAdmin) {
                 adminBadge = `<span class="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">관리자</span>`;
            }
            nameCell.innerHTML = `<div class="flex items-center">${user.name}${adminBadge}</div>`;
            
            const manageCell = document.createElement('td');
            manageCell.className = 'px-6 py-4 whitespace-nowrap text-right text-sm font-medium';
            const editButton = document.createElement('button');
            editButton.textContent = '수정';
            editButton.className = 'text-indigo-600 hover:text-indigo-900 font-semibold edit-user-btn';
            editButton.dataset.userId = user._id; 
            manageCell.appendChild(editButton);

            row.appendChild(nameCell);
            row.appendChild(manageCell);
            
            userListBody.appendChild(row);
        });
        
        if (users.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="2" class="px-6 py-4 text-center text-gray-500">등록된 사용자가 없습니다.</td>`; 
            userListBody.appendChild(row);
        }

        document.querySelectorAll('.edit-user-btn').forEach(button => {
            button.removeEventListener('click', handleEditUserClick); 
            button.addEventListener('click', handleEditUserClick);
        });
    };


    // **10. Initial Load & Event Listeners**
    const initApp = async () => {
        showLoading();
        const loggedIn = await fetchUserStatus();
        if (loggedIn) {
            await fetchProblems();
            const today = new Date();
            renderCalendar(today.getFullYear(), today.getMonth());
        } else {
             showScreen('nameInput'); 
        }
        hideLoading();
    };

    // Calendar Navigation
    const prevMonthBtn = document.getElementById('prev-month-btn');
    const nextMonthBtn = document.getElementById('next-month-btn');
    const currentMonthYear = document.getElementById('current-month-year');
    
    if (prevMonthBtn && currentMonthYear) {
        prevMonthBtn.addEventListener('click', () => {
            const parts = currentMonthYear.textContent.split(' ');
            let year = parseInt(parts[0].replace('년', ''));
            let month = parseInt(parts[1].replace('월', '')) - 1;
            
            month--;
            if (month < 0) {
                month = 11;
                year--;
            }
            renderCalendar(year, month);
        });
    }

    if (nextMonthBtn && currentMonthYear) {
        nextMonthBtn.addEventListener('click', () => {
            const parts = currentMonthYear.textContent.split(' ');
            let year = parseInt(parts[0].replace('년', ''));
            let month = parseInt(parts[1].replace('월', '')) - 1;
            
            month++;
            if (month > 11) {
                month = 0;
                year++;
            }
            renderCalendar(year, month);
        });
    }

    // Modal close button
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            if (problemModal) problemModal.classList.add('hidden');
        });
    }

    // Auth Forms
    const showSignupBtn = document.getElementById('show-signup-btn');
    const showLoginBtn = document.getElementById('show-login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const questionImageInput = document.getElementById('question-image');
    const addOptionBtn = document.getElementById('add-option-btn');

    if (showSignupBtn) showSignupBtn.addEventListener('click', () => showScreen('signup'));
    if (showLoginBtn) showLoginBtn.addEventListener('click', () => showScreen('login'));
    
    // 이름 입력 폼 이벤트 리스너
    if (nameInputForm) {
        nameInputForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('user-name').value;
            showLoading();
            try {
                const response = await fetch(`${API_BASE_URL}/auth/check-name?name=${encodeURIComponent(name)}`, {
                     method: 'GET',
                     headers: { 'Content-Type': 'application/json' }
                });

                if (!response.ok) {
                     const errorText = await response.json();
                     throw new Error(errorText.message || '이름 확인 실패');
                }

                const data = await response.json();
                
                if (data.exists) {
                    document.getElementById('login-name').value = name;
                    showScreen('login');
                } else {
                    document.getElementById('signup-name').value = name;
                    showScreen('signup');
                }

            } catch (error) {
                await showCustomAlert(error.message || '이름 확인 중 오류 발생');
            } finally {
                hideLoading();
            }
        });
    }


    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('login-name').value;
            const password = document.getElementById('login-password').value;
            showLoading();
            try {
                const response = await fetch(`${API_BASE_URL}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, password })
                });

                if (!response.ok) {
                    const errorText = await response.json();
                    throw new Error(errorText.message || '로그인 실패');
                }

                const data = await response.json();
                localStorage.setItem('token', data.token);
                await fetchUserStatus(); 
                await fetchProblems();
                const today = new Date();
                renderCalendar(today.getFullYear(), today.getMonth());


            } catch (error) {
                await showCustomAlert(error.message || '로그인 실패');
            } finally {
                hideLoading();
            }
        });
    }

    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('signup-name').value;
            const password = document.getElementById('signup-password').value;
            showLoading();
            try {
                const response = await fetch(`${API_BASE_URL}/auth/signup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, password })
                });

                if (!response.ok) {
                    const errorText = await response.json();
                    throw new Error(errorText.message || '회원가입 실패');
                }

                const data = await response.json();
                localStorage.setItem('token', data.token);
                await fetchUserStatus(); 
                await fetchProblems();
                const today = new Date();
                renderCalendar(today.getFullYear(), today.getMonth());

            } catch (error) {
                await showCustomAlert(error.message || '회원가입 실패');
            } finally {
                hideLoading();
            }
        });
    }


    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('token');
            localStorage.removeItem('currentUser');
            currentUser = null;
            updateAuthUI();
            showScreen('nameInput'); 
        });
    }
    
    // Account Edit
    if (accountEditForm) {
        accountEditForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newName = document.getElementById('edit-name').value;
            const newPassword = document.getElementById('edit-password').value;
            
            if (!newName) {
                await showCustomAlert('이름은 비워둘 수 없습니다.');
                return;
            }

            showLoading();
            try {
                const token = localStorage.getItem('token');
                const updateData = { name: newName };
                if (newPassword) {
                    updateData.password = newPassword;
                }

                const response = await fetch(`${API_BASE_URL}/users/${currentUser._id}`, {
                    method: 'PUT',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}` 
                    },
                    body: JSON.stringify(updateData)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || '정보 수정 실패');
                }

                const updatedUser = await response.json();
                currentUser = updatedUser;
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                
                const nameDisplay = document.getElementById('current-user-name');
                if(nameDisplay) nameDisplay.textContent = currentUser.name;
                document.getElementById('edit-password').value = ''; 
                await showCustomAlert('정보가 성공적으로 수정되었습니다.');


            } catch (error) {
                console.error('계정 수정 오류:', error);
                await showCustomAlert(error.message || '정보 수정 중 오류 발생');
            } finally {
                hideLoading();
            }
        });
    }
    
    // Add Problem
    if (addOptionBtn) addOptionBtn.addEventListener('click', addOptionField);
    
    // 이미지 처리
    if (questionImageInput) {
        questionImageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            const imagePreview = document.getElementById('image-preview'); 

            if (file && imagePreview) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    imagePreview.src = e.target.result; 
                    imagePreview.classList.remove('hidden');
                };
                reader.readAsDataURL(file);
            } else if (imagePreview) {
                 imagePreview.src = '';
                 imagePreview.classList.add('hidden');
            }
        });
    }

    if (addProblemForm) {
        addProblemForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            showLoading();

            try {
                const date = document.getElementById('problem-date').value;
                const questionText = document.getElementById('question-text').value;
                const questionImageElement = document.getElementById('image-preview');
                const questionImageBase64 = questionImageElement && !questionImageElement.classList.contains('hidden') ? 
                                            questionImageElement.src : null;
                                            
                const correctOptionElement = document.querySelector('input[name="correct-option"]:checked');
                const correctOptionValue = correctOptionElement ? correctOptionElement.value : null;

                const optionRows = document.querySelectorAll('#options-container .option-row');
                const options = Array.from(optionRows).map(row => {
                    const textInput = row.querySelector('.option-input');
                    return {
                        value: textInput.dataset.value,
                        text: textInput.value
                    };
                }).filter(opt => opt.text.trim() !== '');

                if (!date || !questionText.trim() || !correctOptionValue) {
                    throw new Error('날짜, 문제, 정답은 필수 항목입니다.');
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
    }
    
    // **[수정]** 탭 네비게이션 로직
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const view = e.currentTarget.dataset.view;
            showMainView(view);
        });
    });

    initApp();
    
    // **[강화]** 사용자 수정 모달 이벤트 리스너 추가 (오류 발생 라인 근처)
    // userEditForm과 cancelEditUser 변수가 null일 경우를 완벽하게 방어
    if (userEditForm) userEditForm.addEventListener('submit', handleUserEditFormSubmit);
    if (cancelEditUser) cancelEditUser.addEventListener('click', closeUserEditModal);
});