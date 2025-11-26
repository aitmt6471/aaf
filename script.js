/**
 * Google Apps Script Web App URL
 * TODO: Replace this URL with the actual Web App URL from the deployment.
 */
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxsiqIVoQjNvnzCAVomVHjZWWv5dSHLnd03_Ymuj5yTMEbuydtk7d-ezeX9TSv56MT2nQ/exec';

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

    // Generate minutes (00, 30)
    [0, 30].forEach(min => {
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
    const currentMinute = String(Math.floor(today.getMinutes() / 30) * 30).padStart(2, '0');

    if (startDateInput) startDateInput.value = dateString;
    if (endDateInput) endDateInput.value = dateString;

    // Set default time
    startHourSelect.value = currentHour;
    startMinuteSelect.value = currentMinute;
    endHourSelect.value = currentHour;
    endMinuteSelect.value = currentMinute;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Basic Validation
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

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
            showNotification('제출이 완료되었습니다! 감사합니다.', 'success');
            form.reset();

            // Reset to default values
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
    });

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
});
