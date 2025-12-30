/**
 * 근태 기록 웹페이지 → Google Sheets 저장 및 조회
 * 
 * === 기능 ===
 * 1. 웹페이지에서 제출한 데이터를 자동으로 Google Sheets에 저장
 * 2. 소속과 이름으로 근태 기록 조회
 * 
 * === 컬럼 구조 ===
 * A: 접수일자
 * B: 소속
 * C: 직위
 * D: 성명
 * E: 근태발생일자
 * F: 근태종료일자
 * G: 근태구분
 * H: 근태 시간
 * I: 사유 및 상세내용
 * J: 검토상태
 * K: 검토의견
 * L: 승인상태
 * M: 승인의견
 * 
 * === 배포 방법 ===
 * 1. Google Sheets → Extensions → Apps Script
 * 2. 이 코드 전체를 붙여넣기
 * 3. Deploy → New deployment → Web app
 * 4. Execute as: "Me" / Who has access: "Anyone"
 * 5. Deploy 후 URL을 script.js의 SCRIPT_URL에 붙여넣기
 */

// ===== CONFIGURATION =====
const SHEET_NAME = '시트1'; // Main sheet name

// ===== 웹페이지 제출 처리 =====
function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);

        if (!sheet) {
            throw new Error(`Sheet "${SHEET_NAME}" not found.`);
        }

        const timestamp = new Date();
        const startDateTime = `${data.startDate} ${data.startTime}`;
        const endDateTime = `${data.endDate} ${data.endTime}`;

        // A-I 열까지 데이터 저장 (J-M은 수동 관리)
        const rowData = [
            timestamp,              // A: 접수일자
            data.department,        // B: 소속
            data.position,          // C: 직위
            data.name,              // D: 성명
            startDateTime,          // E: 근태발생일자
            endDateTime,            // F: 근태종료일자
            data.type,              // G: 근태구분
            `${data.startTime} ~ ${data.endTime}`, // H: 근태 시간
            data.description        // I: 사유 및 상세내용
        ];

        sheet.appendRow(rowData);

        return ContentService
            .createTextOutput(JSON.stringify({
                status: 'success',
                message: 'Data saved successfully',
                timestamp: timestamp
            }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        return ContentService
            .createTextOutput(JSON.stringify({
                status: 'error',
                message: error.message
            }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

// ===== 조회 API 처리 =====
function doGet(e) {
    try {
        const action = e.parameter.action;

        if (action === 'lookup') {
            const department = e.parameter.department;
            const name = e.parameter.name;

            if (!department || !name) {
                throw new Error('소속과 성명을 모두 입력해주세요.');
            }

            return lookupAttendanceRecords(department, name);
        }

        return ContentService
            .createTextOutput(JSON.stringify({
                status: 'error',
                message: 'Invalid action'
            }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        return ContentService
            .createTextOutput(JSON.stringify({
                status: 'error',
                message: error.message
            }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

function lookupAttendanceRecords(department, name) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);

    if (!sheet) {
        throw new Error(`Sheet "${SHEET_NAME}" not found.`);
    }

    const data = sheet.getDataRange().getValues();

    // 헤더 제외하고 필터링 (소속: B열=1, 성명: D열=3)
    const records = [];

    for (let i = 1; i < data.length; i++) {
        const row = data[i];

        // 소속(B)과 성명(D)이 일치하는 경우
        if (row[1] === department && row[3] === name) {
            records.push({
                submitDate: formatDateForDisplay(row[0]),      // A: 제출 날짜
                department: row[1],                            // B: 소속
                position: row[2],                              // C: 직위
                name: row[3],                                  // D: 성명
                startDate: extractDate(row[4]),                // E: 근태 발생 일자
                endDate: extractDate(row[5]),                  // F: 근태 종료 일자
                type: row[6] || '',                            // G: 근태구분
                time: row[7] || extractTime(row[4], row[5]),   // H: 근태 시간
                description: row[8] || '',                     // I: 근태사유
                reviewStatus: row[9] || '',                    // J: 검토상태
                reviewComment: row[10] || '',                  // K: 검토의견
                approvalStatus: row[11] || '',                 // L: 승인상태
                approvalComment: row[12] || ''                 // M: 승인의견
            });
        }
    }

    return ContentService
        .createTextOutput(JSON.stringify(records))
        .setMimeType(ContentService.MimeType.JSON);
}

// 날짜 포맷 헬퍼 함수
function formatDateForDisplay(dateValue) {
    if (!dateValue) return '';

    try {
        const date = new Date(dateValue);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    } catch (e) {
        return String(dateValue);
    }
}

// 날짜시간 문자열에서 날짜만 추출
function extractDate(dateTimeStr) {
    if (!dateTimeStr) return '';

    try {
        const str = String(dateTimeStr);
        // "2025-11-21 09:00" 형식에서 날짜만 추출
        if (str.includes(' ')) {
            return str.split(' ')[0];
        }
        // 이미 날짜 형식인 경우
        return formatDateForDisplay(dateTimeStr);
    } catch (e) {
        return String(dateTimeStr);
    }
}

// 시작/종료 시간 추출
function extractTime(startDateTime, endDateTime) {
    try {
        const startStr = String(startDateTime);
        const endStr = String(endDateTime);

        let startTime = '';
        let endTime = '';

        // "2025-11-21 09:00" 형식에서 시간만 추출
        if (startStr.includes(' ')) {
            startTime = startStr.split(' ')[1] || '';
        }
        if (endStr.includes(' ')) {
            endTime = endStr.split(' ')[1] || '';
        }

        if (startTime && endTime) {
            return `${startTime} ~ ${endTime}`;
        } else if (startTime) {
            return startTime;
        } else if (endTime) {
            return endTime;
        }

        return '-';
    } catch (e) {
        return '-';
    }
}

// ===== TEST FUNCTION =====
function testDoPost() {
    const testData = {
        department: '생산관리팀',
        name: '홍길동',
        position: '사원',
        startDate: '2025-11-21',
        startTime: '09:00',
        endDate: '2025-11-21',
        endTime: '18:00',
        type: '잔업',
        description: '테스트 데이터입니다.'
    };

    const testEvent = {
        postData: {
            contents: JSON.stringify(testData)
        }
    };

    const result = doPost(testEvent);
    Logger.log(result.getContent());
}
