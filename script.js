document.addEventListener('DOMContentLoaded', () => {
    // ===== 상태 관리 (State Management) =====
    let users = [];
    let problems = [];
    let currentUser = null;
    
    // API 통신 기본 경로 설정
    const API_BASE_URL = '/api'; 

    // **[추가]** 로딩 오버레이 제어 (HTML에 해당 요소가 있다고 가정)
    const loadingOverlay = document.getElementById('loading-overlay');
    const showLoading = () => loadingOverlay ? loadingOverlay.classList.remove('hidden') : null;
    const hideLoading = () => loadingOverlay ? loadingOverlay.classList.add('hidden') : null;

    // ===== DOM 요소 선택 (기존과 동일) =====
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
    
    const customModal = {
        overlay: document.getElementById('custom-modal-overlay'),
        message: document.getElementById('custom-modal-message'),
        okBtn: document.getElementById('custom-modal-ok'),
        cancelBtn: document.getElementById('custom-modal-cancel'),
    };

    // ===== 유틸리티 함수 (기존과 동일) =====
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
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };
    
    // **[추가]** API 호출 함수
    /**
     * 모든 문제 데이터를 서버에서 가져옵니다.
     */
    const fetchProblems = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/problems`);
            if (!response.ok) {
                throw new Error('문제 목록 로드 실패');
            }
            // 서버에서 받아온 problems 배열로 전역 변수 업데이트
            problems = await response.json(); 
        } catch (error) {
            console.error('Error fetching problems:', error);
            await showCustomAlert('문제 데이터를 가져오는 데 실패했습니다.');
        }
    };

    /**
     * 모든 사용자 데이터를 서버에서 가져옵니다. (리더보드용)
     */
    const fetchUsers = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/users`);
            if (!response.ok) {
                throw new Error('사용자 목록 로드 실패');
            }
            users = await response.json();
        } catch (error) {
            console.error('Error fetching users:', error);
            // 사용자 명단 로드 실패는 치명적이지 않으므로 경고만 표시
        }
    };
    
    // **[추가]** 현재 사용자 정보를 서버에서 최신화
    const updateCurrentUser = async () => {
        if (!currentUser || !currentUser._id) return;
        try {
             const response = await fetch(`${API_BASE_URL}/users/${currentUser._id}`);
             if (response.ok) {
                 const userData = await response.json();
                 currentUser = { ...currentUser, ...userData }; // 최신 정보로 덮어쓰기
                 localStorage.setItem('currentUser', JSON.stringify(currentUser));
                 document.getElementById('user-name-display').textContent = currentUser.name;
                 updateAdminUI();
             }
        } catch (error) {
            console.error('Error updating current user:', error);
        }
    }


    // ===== 화면 전환 함수 (기존과 동일) =====
    const showScreen = (screenName) => {
        Object.values(screens).forEach(screen => screen.classList.add('hidden'));
        screens[screenName].classList.remove('hidden');
    };
    
    const showMainView = (viewName) => {
        Object.values(mainViews).forEach(view => view.classList.add('hidden'));
        mainViews[viewName].classList.remove('hidden');
    };
    
    // **[기존과 동일]** 관리자 화면 요소 표시/숨김
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

    // ===== 렌더링 함수 =====

    const renderProblems = (filterDate = null) => {
        const container = document.getElementById('problem-cards-container');
        container.innerHTML = '';
        
        // **[수정]** 로컬 id 대신 date를 사용
        const problemsToRender = filterDate 
            ? problems.filter(p => p.date === filterDate)
            : problems;

        if (problemsToRender.length === 0 && !filterDate) {
             container.innerHTML = `<p class="text-gray-500 col-span-full text-center">아직 등록된 문제가 없습니다.</p>`;
             return;
        }
        if (problemsToRender.length === 0 && filterDate) {
             container.innerHTML = `<p class="text-gray-500 col-span-full text-center">${filterDate}에 등록된 문제가 없습니다.</p>`;
             return;
        }

        // **[수정]** date 기준 정렬
        problemsToRender.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(problem => {
            const card = document.createElement('div');
            card.className = 'relative bg-gray-50 p-6 rounded-xl shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer';
            // **[수정]** problem.id 대신 problem.date 사용
            card.dataset.problemDate = problem.date;
            
            let contentHTML = '';
            // **[수정]** problem.question이 JSON 객체라고 가정 (서버에서 파싱 후 전송)
            if (problem.question.text) {
                contentHTML += `<p class="text-lg font-semibold truncate">${problem.question.text}</p>`;
            }
            if (problem.question.image) {
                contentHTML += `<img src="${problem.question.image}" alt="문제 이미지" class="mt-2 rounded-lg max-h-40 w-full object-cover">`;
            }
            
            let adminControls = '';
            if (currentUser && currentUser.isAdmin) {
                adminControls = `
                    <button class="delete-problem-btn absolute top-2 right-2 text-red-500 hover:text-red-700 p-1 bg-white bg-opacity-70 rounded-full" data-problem-date="${problem.date}">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" />
                        </svg>
                    </button>
                `;
            }

            card.innerHTML = `
                ${contentHTML}
                <div class="text-sm text-gray-500 mt-4 flex justify-between items-center">
                    <span>날짜: ${problem.date}</span>
                    <span>푼 사람: ${problem.solvers.length}명</span>
                </div>
                ${adminControls}
            `;
            card.addEventListener('click', (e) => {
                if (e.target.closest('.delete-problem-btn')) return;
                // **[수정]** problem.id 대신 problem.date 사용
                openProblemModal(problem.date)
            });
            container.appendChild(card);
        });
    };

    const renderUsers = () => {
        const container = document.getElementById('user-list-container');
        container.innerHTML = '';
        // **[수정]** users 배열이 서버에서 로드된 상태라고 가정
        users.filter(u => !u.isAdmin).forEach(user => { 
            const li = document.createElement('li');
            li.className = 'bg-gray-50 p-4 rounded-lg flex justify-between items-center';
            li.innerHTML = `
                <div>
                    <span class="font-semibold">${user.name}</span>
                    <span class="text-gray-500 text-sm ml-2">(${user.score}점)</span>
                </div>
                ${user.isAdmin ? '<span class="text-xs font-bold bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">관리자</span>' : ''}
            `;
            container.appendChild(li);
        });
    };
    
    // renderCalendar 함수는 문제 조회 시 problem.date를 사용하도록 수정되었습니다.
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
                    const dateStr = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, '0')}-${String(cellDate.getDate()).padStart(2, '0')}`;
                    const hasProblem = problems.some(p => p.date === dateStr);
                    
                    cell.innerHTML = `
                        <button data-date="${dateStr}" class="w-10 h-10 rounded-full transition-colors duration-200 flex items-center justify-center ${hasProblem ? 'bg-indigo-200 text-indigo-800 font-bold hover:bg-indigo-300' : 'hover:bg-gray-200'}">
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
         
         tbody.querySelectorAll('button[data-date]').forEach(button => {
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
                       li.textContent = p.question.text || '이미지 문제';
                       // **[수정]** 문제 열 때 date 사용
                       li.addEventListener('click', () => openProblemModal(p.date));
                       list.appendChild(li);
                    });
                    calendarProblemsDisplay.appendChild(list);
                } else {
                    calendarProblemsDisplay.innerHTML += `<p class="text-gray-500">이 날짜에는 문제가 없습니다.</p>`;
                }
            });
         });
    };


    // ===== 이벤트 핸들러 =====

    // **[핵심 수정]** 이름 입력 처리 (서버 통신)
    nameInputForm.addEventListener('submit', async (e) => { // async 키워드 추가
        e.preventDefault();
        const name = document.getElementById('user-name').value.trim();

        if (name.length < 1) {
            showCustomAlert('이름을 입력해주세요.');
            return;
        }

        showLoading(); // 로딩 시작

        try {
            // 서버 API 호출: 사용자 로그인/등록
            const response = await fetch(`${API_BASE_URL}/users/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || '로그인/등록 실패');
            }

            const userData = await response.json();
            currentUser = userData; // 서버에서 받은 사용자 정보로 업데이트 (MongoDB _id 포함)
            
            // 로컬 스토리지에 사용자의 MongoDB _id를 포함한 데이터 저장
            localStorage.setItem('currentUser', JSON.stringify(currentUser)); 
            
            document.getElementById('user-name-display').textContent = currentUser.name;
            updateAdminUI(); 
            showScreen('main');
            showMainView('problems');
            
            // 문제와 사용자 명단도 서버에서 로드
            await fetchProblems(); 
            await fetchUsers(); 
            
            const today = new Date();
            renderProblems();
            renderCalendar(today.getFullYear(), today.getMonth());
            nameInputForm.reset();

        } catch (error) {
            console.error('로그인/등록 오류:', error);
            await showCustomAlert(`로그인/등록 실패: ${error.message}`);
        } finally {
            hideLoading(); // 로딩 종료
        }
    });

    // 로그아웃 처리 (기존과 동일)
    document.getElementById('logout-button').addEventListener('click', () => {
        currentUser = null;
        localStorage.removeItem('currentUser');
        showScreen('nameInput'); 
    });

    // **[수정]** 관리자 인증 폼 제출 처리 (서버 통신)
    adminAuthForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('admin-id').value;
        const password = document.getElementById('admin-password').value;
        const errorMsg = document.getElementById('admin-auth-error');

        showLoading(); // 로딩 시작

        try {
            const response = await fetch(`${API_BASE_URL}/admin/auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, password, currentUserId: currentUser._id }) // 현재 사용자 _id 전송
            });

            if (response.ok) {
                // 인증 성공. 서버에서 관리자로 업데이트된 사용자 정보 수신
                const adminData = await response.json();
                
                currentUser = { ...currentUser, ...adminData }; // 현재 사용자 정보 업데이트
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                
                adminAuthModal.classList.add('hidden');
                updateAdminUI(); 
                await showCustomAlert('관리자 인증이 완료되었습니다.');
                renderProblems(); 
                errorMsg.classList.add('hidden');
            } else {
                 // 인증 실패
                const errorText = await response.text();
                errorMsg.textContent = errorText || 'ID 또는 비밀번호가 일치하지 않습니다.';
                errorMsg.classList.remove('hidden');
            }

        } catch (error) {
            console.error('관리자 인증 오류:', error);
            errorMsg.textContent = '인증 중 오류가 발생했습니다.';
            errorMsg.classList.remove('hidden');
        } finally {
             hideLoading(); // 로딩 종료
        }
    });

    // **[기존과 동일]** 관리자 인증 취소 버튼 이벤트 리스너
    document.getElementById('cancel-admin-auth').addEventListener('click', () => {
        adminAuthModal.classList.add('hidden');
    });
    
    // **[기존과 동일]** 관리자 인증 버튼 이벤트 리스너
    document.getElementById('nav-admin-auth').addEventListener('click', () => {
        adminAuthModal.classList.remove('hidden');
        document.getElementById('admin-auth-error').classList.add('hidden');
        adminAuthForm.reset();
    });


    // 네비게이션 (문제/사용자 목록 로드 시 서버에서 데이터 패치 추가)
    document.getElementById('nav-problems').addEventListener('click', async () => {
        showLoading();
        await fetchProblems(); // 서버에서 최신 문제 목록 로드
        showMainView('problems');
        renderProblems();
        const today = new Date();
        renderCalendar(today.getFullYear(), today.getMonth());
        hideLoading();
    });
    document.getElementById('nav-users').addEventListener('click', async () => {
        showLoading();
        await fetchUsers(); // 서버에서 최신 사용자 목록 로드
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

    // 계정 정보 수정 (서버 통신 필요)
    accountEditForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newName = document.getElementById('edit-name').value;
        
        if (newName === currentUser.name) {
             showMainView('problems');
             return;
        }

        showLoading();

        try {
            // **[추가]** 서버 API 호출: 사용자 이름 업데이트
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

            // 클라이언트 상태 업데이트
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

    // 문제 삭제 처리 (이벤트 위임 - 서버 통신 필요)
    document.getElementById('problem-cards-container').addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-problem-btn');
        if (deleteBtn) {
            e.stopPropagation();
            if (!currentUser || !currentUser.isAdmin) {
                 await showCustomAlert('관리자만 문제를 삭제할 수 있습니다.');
                 return;
            }
            // **[수정]** problem.id 대신 problem.date 사용
            const problemDate = deleteBtn.dataset.problemDate; 
            const confirmed = await showCustomConfirm(`${problemDate} 날짜의 문제를 삭제하시겠습니까?`);
            
            if (confirmed) {
                showLoading(); // 로딩 시작
                try {
                    // **[추가]** 서버 API 호출: 문제 삭제
                    const response = await fetch(`${API_BASE_URL}/problems/${problemDate}`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        // 관리자 인증을 위해 토큰을 사용해야 하지만, 현재는 로직 단순화를 위해 생략
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(errorText || '문제 삭제 실패');
                    }
                    
                    // 삭제 성공 후, 최신 문제 목록 다시 가져오기
                    await fetchProblems(); 

                    renderProblems();
                    await showCustomAlert('문제가 삭제되었습니다.');
                    
                } catch (error) {
                     console.error('문제 삭제 오류:', error);
                    await showCustomAlert(error.message || '문제 삭제 중 오류 발생');
                } finally {
                    hideLoading(); // 로딩 종료
                }
            }
        }
    });

    // **[기존과 동일]** 문제 추가 폼 관련 유틸리티 함수
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
                <input type="file" class="option-image-upload w-full text-sm text-gray-500 file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer">
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
                preview.src = '';
                preview.classList.add('hidden');
            }
        });
    };
    
    const resetAddProblemForm = () => {
        addProblemForm.reset();
        document.getElementById('problem-image-preview').classList.add('hidden');
        optionsContainer.innerHTML = '<label class="block text-sm font-medium text-gray-700">객관식 선택지 (정답을 선택하세요)</label>';
        optionCount = 0;
        for(let i=0; i<4; i++) createOptionInput(i === 0);
        optionsContainer.querySelector('input[type="radio"]').checked = true;
    }

    addOptionBtn.addEventListener('click', () => createOptionInput());

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
            preview.src = '';
            preview.classList.add('hidden');
        }
    });

    // **[핵심 수정]** 문제 추가 로직 (서버 통신 및 무한 로딩 해결)
    addProblemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser || !currentUser.isAdmin) {
             await showCustomAlert('문제 추가는 관리자만 가능합니다.');
             return;
        }

        showLoading(); // 로딩 시작

        try {
            const questionText = document.getElementById('problem-text').value;
            const questionImageFile = document.getElementById('problem-image-upload').files[0];
            const problemDate = document.getElementById('problem-date').value || new Date().toISOString().split('T')[0];

            if (!questionText && !questionImageFile) {
                throw new Error('문제 내용 또는 이미지를 입력해야 합니다.');
            }
            if (!problemDate) {
                 throw new Error('문제가 출제될 날짜를 선택해야 합니다.');
            }

            const questionImage = await readFileAsDataURL(questionImageFile);
            
            const validOptionDivs = Array.from(optionsContainer.querySelectorAll('.flex.items-start')).filter(div => {
                const text = div.querySelector('.option-text')?.value || ''; 
                const imageFile = div.querySelector('.option-image-upload')?.files[0];
                return text || imageFile;
            });

            if (validOptionDivs.length < 2) {
                throw new Error('유효한 선택지는 최소 2개 이상이어야 합니다.');
            }

            const optionPromises = validOptionDivs.map(div => {
                const text = div.querySelector('.option-text')?.value || ''; 
                const imageFile = div.querySelector('.option-image-upload')?.files[0];
                return readFileAsDataURL(imageFile).then(image => ({ text, image }));
            });

            const resolvedOptions = await Promise.all(optionPromises);

            const correctRadio = addProblemForm.querySelector('input[name="correct-option"]:checked');
            if (!correctRadio) {
                throw new Error('정답을 선택해주세요.');
            }
            const correctDiv = correctRadio.closest('.flex.items-start');
            const correctIndex = validOptionDivs.indexOf(correctDiv);

            if (correctIndex === -1) {
                throw new Error('선택된 정답이 유효한 선택지가 아닙니다.');
            }
            
            // **[핵심]** 서버가 요구하는 데이터 구조로 변환
            // question 필드에 텍스트, 이미지, 옵션 배열을 JSON 문자열로 통합하여 전송
            const serverQuestion = JSON.stringify({
                text: questionText, 
                image: questionImage,
                options: resolvedOptions // 클라이언트가 옵션 관리를 하므로, 여기에 저장
            });
            
            // 정답은 선택지 번호(1부터 시작)로 서버에 전송.
            const serverAnswer = correctIndex + 1; 
            
            const newProblemData = {
                date: problemDate,
                question: serverQuestion, // 서버 모델(String)에 맞게 JSON 문자열로 전송
                answer: serverAnswer
            };
            
            // **[핵심]** 서버 API 호출
            const response = await fetch(`${API_BASE_URL}/problems`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newProblemData)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || '문제 추가 실패');
            }

            // 문제 추가 성공 후, 서버에서 최신 문제 목록 다시 가져오기
            await fetchProblems(); 
            
            await showCustomAlert('문제 추가 완료');
            showMainView('problems');
            renderProblems();
            resetAddProblemForm();
        } catch (error) {
            console.error('문제 추가 오류:', error);
            await showCustomAlert(error.message || '문제 추가 중 오류 발생');
        } finally {
            hideLoading(); // 로딩 종료
        }
    });

    document.getElementById('cancel-add-problem').addEventListener('click', () => showMainView('problems'));

    // 문제 풀이 모달 로직 
    // **[수정]** problemId 대신 problemDate 사용
    const openProblemModal = (problemDate) => {
        const problem = problems.find(p => p.date === problemDate);
        if (!problem) return;

        problemModal.dataset.currentProblemDate = problemDate;

        const contentDiv = document.getElementById('modal-problem-content');
        contentDiv.innerHTML = '';
        if (problem.question.text) {
            contentDiv.innerHTML += `<p class="text-xl">${problem.question.text}</p>`;
        }
        if (problem.question.image) {
            contentDiv.innerHTML += `<img src="${problem.question.image}" alt="문제 이미지" class="mt-4 rounded-lg max-w-full mx-auto">`;
        }

        const optionsContainer = document.getElementById('modal-options-container');
        optionsContainer.innerHTML = '';
        
        // **[수정]** problem.question.options 사용 (서버에서 파싱된 객체라고 가정)
        problem.question.options.forEach((option, index) => {
            const button = document.createElement('button');
            button.className = 'block w-full text-left p-4 border rounded-lg hover:bg-gray-100 transition';
            
            let optionContent = '';
             if (option.text) {
                optionContent += `<span class="font-medium">${index + 1}. ${option.text}</span>`;
            }
            if (option.image) {
                optionContent += `<img src="${option.image}" alt="선택지 이미지" class="mt-2 rounded-lg max-h-32">`;
            }
            button.innerHTML = optionContent;

            // **[수정]** problem.solvers는 서버에서 내려온 ObjectId를 가짐
            const alreadySolved = problem.solvers.some(s => currentUser._id && s.userId === currentUser._id);
            if (alreadySolved) {
                button.disabled = true;
                button.classList.add('opacity-50', 'cursor-not-allowed');
            } else {
                // **[수정]** handleAnswer에 problemDate 전달
                button.addEventListener('click', () => handleAnswer(problemDate, index));
            }

            optionsContainer.appendChild(button);
        });

        document.getElementById('modal-feedback').innerHTML = '';
        updateSolverInfo(problem);
        problemModal.classList.remove('hidden');
    };

    // **[핵심 수정]** 문제 풀이 로직 (서버 통신)
    const handleAnswer = async (problemDate, selectedIndex) => { // async 키워드 추가
        const problem = problems.find(p => p.date === problemDate);
        if (!problem) return;
        
        // 이미 푼 사용자인지 확인 (서버에서 처리하지만, 클라이언트에서도 사전 확인)
        if (problem.solvers.some(s => currentUser._id && s.userId === currentUser._id)) { 
            await showCustomAlert('이미 이 퀴즈를 풀었습니다.');
            return;
        }

        showLoading(); // 로딩 시작

        try {
            // **[핵심]** 서버 API 호출: 퀴즈 제출
            const response = await fetch(`${API_BASE_URL}/problems/${problemDate}/solve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    userId: currentUser._id, // MongoDB _id 사용
                    answer: selectedIndex + 1 // 선택지 번호 (1부터 시작)
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || '퀴즈 제출 실패');
            }

            const result = await response.json(); // { success, isCorrect, newScore }

            const feedbackDiv = document.getElementById('modal-feedback');
            if (result.isCorrect) {
                feedbackDiv.textContent = `정답! (점수: ${result.newScore})`;
                feedbackDiv.className = 'mt-4 text-center font-bold text-green-600';
            } else {
                feedbackDiv.textContent = `오답! (점수: ${result.newScore})`;
                feedbackDiv.className = 'mt-4 text-center font-bold text-red-600';
            }
            
            // 문제 목록과 사용자 목록을 다시 로드하여 최신 정보 반영
            await fetchProblems(); 
            await fetchUsers(); 
            
            // 현재 사용자의 점수 및 정보 업데이트
            await updateCurrentUser();
            
            // 모달 업데이트
            const updatedProblem = problems.find(p => p.date === problemDate);
            if (updatedProblem) updateSolverInfo(updatedProblem);
            renderProblems();
            
            // 문제 풀이 후 버튼 비활성화
            document.querySelectorAll('#modal-options-container button').forEach(btn => {
                btn.disabled = true;
                btn.classList.add('opacity-50', 'cursor-not-allowed');
            });

        } catch (error) {
            console.error('퀴즈 제출 오류:', error);
            await showCustomAlert(`퀴즈 제출 실패: ${error.message}`);
        } finally {
            hideLoading(); // 로딩 종료
        }
    };

    const updateSolverInfo = (problem) => {
         document.getElementById('solver-count').textContent = `푼 사람: ${problem.solvers.length}명`;
         const solversListUl = document.querySelector('#modal-solvers-list ul');
         solversListUl.innerHTML = '';
         if (problem.solvers.length > 0) {
             problem.solvers.forEach(solver => {
                 const resultText = solver.isCorrect 
                     ? `<span class="text-green-600 font-semibold">(⭕)</span>` 
                     : `<span class="text-red-600 font-semibold">(❌)</span>`;

                 const li = document.createElement('li'); // li 변수 선언 추가
                 li.innerHTML = `${solver.name} ${resultText}`;
                 solversListUl.appendChild(li);
             });
         } else {
             solversListUl.innerHTML = '<li>아직 아무도 풀지 않았습니다.</li>';
         }
    };

    document.getElementById('close-modal-btn').addEventListener('click', () => {
        problemModal.classList.add('hidden');
    });

    const showSolversBtn = document.getElementById('show-solvers-btn');
    const solversList = document.getElementById('modal-solvers-list');
    showSolversBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        solversList.classList.toggle('hidden');
    });
    document.body.addEventListener('click', () => solversList.classList.add('hidden'));


    // ===== 초기화 로직 (서버 데이터 로드) =====
    const initializeApp = async () => {
        showLoading();
        const savedUser = localStorage.getItem('currentUser');
        
        if (savedUser) {
            currentUser = JSON.parse(savedUser);
            
            // 서버에서 사용자 정보 최신화
            await updateCurrentUser(); 

            // 초기 데이터 로드
            await fetchProblems();
            await fetchUsers();

            document.getElementById('user-name-display').textContent = currentUser.name;
            updateAdminUI(); 

            showScreen('main');
            showMainView('problems');
            renderProblems();
            const today = new Date();
            renderCalendar(today.getFullYear(), today.getMonth());
        } else {
            showScreen('nameInput');
        }
        hideLoading();
    };

    initializeApp();
});