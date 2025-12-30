/**
 * Google Apps Script Web App URL
 * TODO: Replace this URL with the actual Web App URL from the deployment.
 */
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwFJi4ILrYSlFXxxSZDWPczGg74ooqBnDvat3Nh8xyKqqfVdbEhex9jLLJd0wED8nRjSA/exec';

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('attendanceForm');
    const submitBtn = form.querySelector('.submit-btn');
    const btnText = submitBtn.querySelector('.btn-text');
    const loader = submitBtn.querySelector('.loader');
    const notification = document.getElementById('notification');
    const notificationMessage = document.getElementById('notificationMessage');

    // Populate time select options
    const startHourSelect = document.getElementById('startHour');
    const startMinuteSelect = document.getElementById('startMinute');
    const endHourSelect = document.getElementById('endHour');
    const endMinuteSelect = document.getElementById('endMinute');

    // Generate hours (00-23)
    for (let i = 0; i < 24; i++) {
        const hour = String(i).padStart(2, '0');
        startHourSelect.add(new Option(hour, hour));
        endHourSelect.add(new Option(hour, hour));
    }

    // Generate minutes (00, 10, 20, 30, 40, 50)
    [0, 10, 20, 30, 40, 50].forEach(min => {
        const minute = String(min).padStart(2, '0');
        startMinuteSelect.add(new Option(minute, minute));
        endMinuteSelect.add(new Option(minute, minute));
    });

    // Set default date and time to today
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');

    const today = new Date();
    const dateString = today.toISOString().split('T')[0];
    const currentHour = String(today.getHours()).padStart(2, '0');
    const currentMinute = String(Math.floor(today.getMinutes() / 10) * 10).padStart(2, '0');

    if (startDateInput) startDateInput.value = dateString;
    if (endDateInput) endDateInput.value = dateString;

    // Set default time
    startHourSelect.value = currentHour;
    startMinuteSelect.value = currentMinute;
    endHourSelect.value = currentHour;
    endMinuteSelect.value = currentMinute;

    // 근태 발생 일자가 변경되면 종료 일자의 최소값을 발생 일자로 설정
    startDateInput.addEventListener('change', function () {
        const startDate = this.value;
        endDateInput.min = startDate;

        // 만약 현재 종료 일자가 발생 일자보다 빠르면 자동으로 발생 일자와 같게 설정
        if (endDateInput.value && endDateInput.value < startDate) {
            endDateInput.value = startDate;
        }
    });

    // 초기 로드 시에도 최소값 설정
    if (startDateInput.value) {
        endDateInput.min = startDateInput.value;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Basic Validation
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        // 근태구분 확인
        const attendanceType = document.getElementById('type').value;

        // 중복 체크: 근태구분이 '취소'가 아닐 때만 체크
        if (attendanceType !== '취소') {
            const name = document.getElementById('name').value.trim();
            const startDate = document.getElementById('startDate').value;
            const key = `attendance_${name}_${startDate}`;

            // localStorage에 저장된 기록 확인
            const existingRecord = localStorage.getItem(key);
            if (existingRecord) {
                showNotification('이미 해당 날짜에 근태계가 존재하므로, 취소 근태계를 먼저 작성해주십시오.', 'error');
                return;
            }
        }

        // Show confirmation modal
        showConfirmModal();
    });

    // Confirm Modal Logic
    const confirmModal = document.getElementById('confirmModal');
    const confirmSubmitBtn = document.getElementById('confirmSubmit');
    const cancelSubmitBtn = document.getElementById('cancelSubmit');

    function formatDateKorean(dateString) {
        // "2025-12-01" -> "2025년 12월 1일"
        const date = new Date(dateString);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        return `${year}년 ${month}월 ${day}일`;
    }

    function formatTimeKorean(hour, minute) {
        // "14:30" -> "오후 2시 30분"
        const h = parseInt(hour);
        const m = parseInt(minute);
        const period = h < 12 ? '오전' : '오후';
        const displayHour = h === 0 ? 12 : (h > 12 ? h - 12 : h);
        return `${period} ${displayHour}시 ${m.toString().padStart(2, '0')}분`;
    }

    function showConfirmModal() {
        // Collect form data for display
        const department = document.getElementById('department').value;
        const name = document.getElementById('name').value;
        const startDate = document.getElementById('startDate').value;
        const startHour = document.getElementById('startHour').value;
        const startMinute = document.getElementById('startMinute').value;
        const endDate = document.getElementById('endDate').value;
        const endHour = document.getElementById('endHour').value;
        const endMinute = document.getElementById('endMinute').value;
        const type = document.getElementById('type').value;

        // Format dates and times in Korean
        const startDateKorean = formatDateKorean(startDate);
        const startTimeKorean = formatTimeKorean(startHour, startMinute);
        const endDateKorean = formatDateKorean(endDate);
        const endTimeKorean = formatTimeKorean(endHour, endMinute);

        // Display data in modal
        document.getElementById('confirmDepartment').textContent = department;
        document.getElementById('confirmName').textContent = name;

        const confirmStartDateEl = document.getElementById('confirmStartDate');
        confirmStartDateEl.textContent = startDateKorean;
        confirmStartDateEl.classList.add('date-time');

        const confirmStartTimeEl = document.getElementById('confirmStartTime');
        confirmStartTimeEl.textContent = startTimeKorean;
        confirmStartTimeEl.classList.add('date-time');

        const confirmEndDateEl = document.getElementById('confirmEndDate');
        confirmEndDateEl.textContent = endDateKorean;
        confirmEndDateEl.classList.add('date-time');

        const confirmEndTimeEl = document.getElementById('confirmEndTime');
        confirmEndTimeEl.textContent = endTimeKorean;
        confirmEndTimeEl.classList.add('date-time');

        document.getElementById('confirmType').textContent = type;

        // Show modal
        confirmModal.classList.remove('hidden');
    }

    function hideConfirmModal() {
        confirmModal.classList.add('hidden');
    }

    // Cancel button - just close modal
    cancelSubmitBtn.addEventListener('click', hideConfirmModal);

    // Confirm button - proceed with submission
    confirmSubmitBtn.addEventListener('click', async () => {
        hideConfirmModal();
        await submitForm();
    });

    // Close modal when clicking outside
    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) {
            hideConfirmModal();
        }
    });

    async function submitForm() {
        // UI: Loading State
        setLoading(true);
        hideNotification();

        // Collect Data
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Combine hour and minute into time format
        data.startTime = `${data.startHour}:${data.startMinute}`;
        data.endTime = `${data.endHour}:${data.endMinute}`;

        // Remove individual hour/minute fields
        delete data.startHour;
        delete data.startMinute;
        delete data.endHour;
        delete data.endMinute;

        try {
            if (SCRIPT_URL === 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE') {
                throw new Error('Backend URL not configured. Please set the SCRIPT_URL in script.js.');
            }

            const response = await fetch(SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            // Since mode is 'no-cors', we can't read the response
            // Assume success if no error was thrown

            // localStorage에 기록 저장 (중복 체크용)
            const name = data.name.trim();
            const startDate = data.startDate;
            const key = `attendance_${name}_${startDate}`;

            // 근태구분이 '취소'인 경우, 기존 기록 삭제
            if (data.type === '취소') {
                localStorage.removeItem(key);
            } else {
                // 그 외의 경우 저장
                localStorage.setItem(key, JSON.stringify({
                    name: name,
                    date: startDate,
                    type: data.type,
                    timestamp: new Date().toISOString()
                }));
            }

            showNotification('제출이 완료되었습니다! 감사합니다.', 'success');
            form.reset();

            // Reset to default values
            const startDateInput = document.getElementById('startDate');
            const endDateInput = document.getElementById('endDate');
            const today = new Date();
            const dateString = today.toISOString().split('T')[0];
            const currentHour = String(today.getHours()).padStart(2, '0');
            const currentMinute = String(Math.floor(today.getMinutes() / 10) * 10).padStart(2, '0');

            startDateInput.value = dateString;
            endDateInput.value = dateString;
            startHourSelect.value = currentHour;
            startMinuteSelect.value = currentMinute;
            endHourSelect.value = currentHour;
            endMinuteSelect.value = currentMinute;

        } catch (error) {
            console.error('Error:', error);
            showNotification(error.message || '제출 중 오류가 발생했습니다. 다시 시도해 주세요.', 'error');
        } finally {
            setLoading(false);
        }
    }

    function setLoading(isLoading) {
        if (isLoading) {
            btnText.style.display = 'none';
            loader.style.display = 'inline-block';
            submitBtn.disabled = true;
        } else {
            btnText.style.display = 'inline';
            loader.style.display = 'none';
            submitBtn.disabled = false;
        }
    }

    function showNotification(message, type) {
        notificationMessage.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.remove('hidden');
    }

    function hideNotification() {
        notification.classList.add('hidden');
    }

    // ===== Tab Switching =====
    const tabBtns = document.querySelectorAll('.tab-btn');
    const submitSection = document.getElementById('submitSection');
    const lookupSection = document.getElementById('lookupSection');
    const headerDescription = document.getElementById('headerDescription');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;

            // Update active tab button
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Switch sections
            if (tab === 'submit') {
                submitSection.classList.remove('hidden');
                submitSection.classList.add('active');
                lookupSection.classList.remove('active');
                lookupSection.classList.add('hidden');
                headerDescription.textContent = '정확한 근태 관리를 위해 특이사항을 입력해 주세요.';
            } else if (tab === 'lookup') {
                lookupSection.classList.remove('hidden');
                lookupSection.classList.add('active');
                submitSection.classList.remove('active');
                submitSection.classList.add('hidden');
                headerDescription.textContent = '소속과 성명을 입력하여 근태 신청 내역을 조회하세요.';
            }
        });
    });

    // ===== Lookup Functionality =====
    const lookupForm = document.getElementById('lookupForm');
    const statsContainer = document.getElementById('statsContainer');
    const tableContainer = document.getElementById('tableContainer');
    const recordsTableBody = document.getElementById('recordsTableBody');
    const annualLeaveCount = document.getElementById('annualLeaveCount');
    const halfLeaveCount = document.getElementById('halfLeaveCount');
    const noRecords = document.getElementById('noRecords');

    lookupForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const department = document.getElementById('lookupDepartment').value;
        const name = document.getElementById('lookupName').value;
        const lookupBtn = lookupForm.querySelector('.lookup-btn');
        const btnText = lookupBtn.querySelector('.btn-text');
        const loader = lookupBtn.querySelector('.loader');

        // Show loading state
        btnText.style.display = 'none';
        loader.style.display = 'inline-block';
        lookupBtn.disabled = true;

        // Hide previous results
        statsContainer.classList.add('hidden');
        tableContainer.classList.add('hidden');

        try {
            // Call Google Apps Script API
            const response = await fetch(`${SCRIPT_URL}?action=lookup&department=${encodeURIComponent(department)}&name=${encodeURIComponent(name)}`, {
                method: 'GET'
            });

            const data = await response.json();

            if (data && data.length > 0) {
                // Calculate leave counts
                let annualCount = 0;
                let halfCount = 0;

                data.forEach(record => {
                    if (record.type === '연차') annualCount++;
                    if (record.type === '반차') halfCount++;
                });

                // Update stats
                annualLeaveCount.textContent = annualCount;
                halfLeaveCount.textContent = halfCount;
                statsContainer.classList.remove('hidden');

                // Render table
                renderRecordsTable(data);
                tableContainer.classList.remove('hidden');
                noRecords.classList.add('hidden');
            } else {
                // No records found
                statsContainer.classList.add('hidden');
                tableContainer.classList.remove('hidden');
                recordsTableBody.innerHTML = '';
                noRecords.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Lookup error:', error);
            alert('조회 중 오류가 발생했습니다. 다시 시도해 주세요.');
        } finally {
            // Reset button state
            btnText.style.display = 'inline';
            loader.style.display = 'none';
            lookupBtn.disabled = false;
        }
    });

    function renderRecordsTable(records) {
        recordsTableBody.innerHTML = '';

        records.forEach(record => {
            const row = document.createElement('tr');

            // Format date
            const dateStr = formatDate(record.startDate, record.endDate);

            // Format time
            const timeStr = record.time || '-';

            // Get status badges
            const reviewBadge = getStatusBadge(record.reviewStatus);
            const approvalBadge = getStatusBadge(record.approvalStatus);

            row.innerHTML = `
                <td>${dateStr}</td>
                <td><strong>${record.type}</strong></td>
                <td>${timeStr}</td>
                <td>${record.description || '-'}</td>
                <td>${reviewBadge}</td>
                <td>${approvalBadge}</td>
            `;

            recordsTableBody.appendChild(row);
        });
    }

    function formatDate(startDate, endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);

        const formatSingle = (date) => {
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const day = date.getDate();
            return `${year}.${month}.${day}`;
        };

        if (startDate === endDate) {
            return formatSingle(start);
        } else {
            return `${formatSingle(start)} ~ ${formatSingle(end)}`;
        }
    }

    function getStatusBadge(status) {
        if (!status || status === '' || status === '-') {
            return '<span class="status-badge status-none">-</span>';
        }

        const statusLower = status.toLowerCase();

        if (statusLower.includes('승인') || statusLower.includes('완료')) {
            return `<span class="status-badge status-approved">${status}</span>`;
        } else if (statusLower.includes('대기') || statusLower.includes('검토')) {
            return `<span class="status-badge status-pending">${status}</span>`;
        } else if (statusLower.includes('반려') || statusLower.includes('거부')) {
            return `<span class="status-badge status-rejected">${status}</span>`;
        } else {
            return `<span class="status-badge status-none">${status}</span>`;
        }
    }
});