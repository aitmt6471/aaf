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
 * E: 근태발생일자 + 시간
 * F: 근태종료일자 + 시간
 * G: 근태구분
 * H: 근태사유
 * I: 검토상태
 * J: 검토처리일자
 * K: 승인상태
 * L: 승인처리일자
 * 
 * === 배포 방법 ===
 * 1. Google Sheets → Extensions → Apps Script
 * 2. 이 코드 전체를 붙여넣기
 * 3. Deploy → New deployment → Web app
 * 4. Execute as: "Me" / Who has access: "Anyone"
 * 5. Deploy 후 URL을 script.js의 SCRIPT_URL에 붙여넣기
 */

// ===== CONFIGURATION =====
const SHEET_GID = 1588285255; // Sheet gid (from URL: gid=1588285255)

// ===== CORS Preflight 처리 =====
function doOptions(e) {
    return ContentService
        .createTextOutput('')
        .setMimeType(ContentService.MimeType.TEXT);
}

// ===== 웹페이지 제출 및 조회 처리 =====
function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);
        
        // 조회 요청인 경우
        if (data.action === 'lookup') {
            return lookupAttendanceRecords(data.department, data.name);
        }
        
        // 삭제(취소) 요청인 경우
        if (data.action === 'cancelRecord') {
            return cancelAttendanceRecord(data);
        }

        // 제출 요청인 경우
        const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
        const sheets = spreadsheet.getSheets();

        // Find sheet by gid
        let sheet = null;
        for (let i = 0; i < sheets.length; i++) {
            if (sheets[i].getSheetId() === SHEET_GID) {
                sheet = sheets[i];
                break;
            }
        }

        if (!sheet) {
            throw new Error(`Sheet with gid "${SHEET_GID}" not found.`);
        }

        const timestamp = new Date();
        const startDateTime = `${data.startDate} ${data.startTime}`;
        const endDateTime = `${data.endDate} ${data.endTime}`;

        // A-H 열까지 데이터 저장 (I-L은 수동 관리: 검토상태, 검토일자, 승인상태, 승인일자)
        const rowData = [
            timestamp,              // A: 접수일자
            data.department,        // B: 소속
            data.position,          // C: 직위
            data.name,              // D: 성명
            startDateTime,          // E: 근태발생일자 + 시간 + 분
            endDateTime,            // F: 근태종료일자 + 시간 + 분
            data.type,              // G: 근태구분
            data.description        // H: 근태사유
        ];

        const lock = LockService.getScriptLock();
        lock.waitLock(30000);

        try {
            if (isDuplicateAttendanceRecord(sheet, data)) {
                return ContentService
                    .createTextOutput(JSON.stringify({
                        status: 'error',
                        code: 'DUPLICATE_ATTENDANCE',
                        message: '동일한 소속, 직위, 성명, 근태발생일시, 근태종료일시, 근태구분의 근태계는 중복 등록할 수 없습니다.'
                    }))
                    .setMimeType(ContentService.MimeType.JSON);
            }

            const rowNumber = sheet.getLastRow() + 1;

            sheet.getRange(rowNumber, 1, 1, rowData.length)
                 .setValues([rowData]);

            SpreadsheetApp.flush();

            return ContentService
                .createTextOutput(JSON.stringify({
                    status: 'success',
                    message: 'Data saved successfully',
                    timestamp: timestamp,
                    row: rowNumber
                }))
                .setMimeType(ContentService.MimeType.JSON);

        } finally {
            lock.releaseLock();
        }

    } catch (error) {
        return ContentService
            .createTextOutput(JSON.stringify({
                status: 'error',
                message: error.message
            }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

// 시작/종료 값을 'yyyy-MM-dd HH:mm' 문자열로 통일 (Date 셀 / 문자열 셀 모두 대응)
function toDateTimeKey(v) {
    if (v instanceof Date) {
        return Utilities.formatDate(v, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');
    }
    const s = String(v).trim();
    const m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2})/);
    if (!m) return s;
    const p = (n) => ('0' + n).slice(-2);
    return `${m[1]}-${p(m[2])}-${p(m[3])} ${p(m[4])}:${p(m[5])}`;
}

// 완전 동일 건(소속+직위+성명+시작+종료+근태구분) 중복 등록 방지
// 근태구분이 다르면(예: 지각 + 연차) 같은 날이어도 중복으로 보지 않음
function isDuplicateAttendanceRecord(sheet, data) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return false;

    const startKey = toDateTimeKey(`${data.startDate} ${data.startTime}`);
    const endKey = toDateTimeKey(`${data.endDate} ${data.endTime}`);

    const rows = sheet.getRange(2, 2, lastRow - 1, 6).getValues(); // B:G
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (String(r[0]).trim() !== data.department) continue;
        if (String(r[1]).trim() !== data.position) continue;
        if (String(r[2]).trim() !== data.name) continue;
        if (toDateTimeKey(r[3]) !== startKey) continue;
        if (toDateTimeKey(r[4]) !== endKey) continue;
        if (String(r[5]).trim() !== data.type) continue;
        return true;
    }
    return false;
}

// 근태 신청 내역 삭제: 검토/승인 완료 건은 서버에서도 거부
function cancelAttendanceRecord(data) {
    const respond = (obj) => ContentService
        .createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()
        .filter((s) => s.getSheetId() === SHEET_GID)[0];
    if (!sheet) return respond({ status: 'error', message: 'Sheet not found' });

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return respond({ status: 'error', message: 'NOT_FOUND' });

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
    const values = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
    for (let i = 0; i < values.length; i++) {
        const r = values[i];
        if (String(r[1]).trim() !== data.department) continue;
        if (String(r[3]).trim() !== data.name) continue;
        if (toDateTimeKey(r[4]) !== data.startKey) continue;
        if (toDateTimeKey(r[5]) !== data.endKey) continue;
        if (String(r[6]).trim() !== data.type) continue;

        if (String(r[8]).trim() === '승인' || String(r[10]).trim() === '승인') {
            return respond({ status: 'error', message: 'ALREADY_PROCESSED' });
        }
        sheet.deleteRow(i + 2);
        return respond({ status: 'success' });
    }
    return respond({ status: 'error', message: 'NOT_FOUND' });
    } finally {
        lock.releaseLock();
    }
}

function lookupAttendanceRecords(department, name) {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = spreadsheet.getSheets();

    // Find sheet by gid
    let sheet = null;
    for (let i = 0; i < sheets.length; i++) {
        if (sheets[i].getSheetId() === SHEET_GID) {
            sheet = sheets[i];
            break;
        }
    }

    if (!sheet) {
        return ContentService
            .createTextOutput(JSON.stringify({
                status: 'error',
                message: `Sheet with gid "${SHEET_GID}" not found.`
            }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    const data = sheet.getDataRange().getValues();

    // 헤더 제외하고 필터링 (소속: B열=1, 성명: D열=3)
    const records = [];

    for (let i = 1; i < data.length; i++) {
        const row = data[i];

        // 소속(B)과 성명(D)이 일치하는 경우
        if (row[1] === department && row[3] === name) {
            records.push({
                submitDate: formatDateForDisplay(row[0]),      // A: 접수일자
                department: row[1],                            // B: 소속
                position: row[2],                              // C: 직위
                name: row[3],                                  // D: 성명
                startDate: row[4] || '',                       // E: 근태발생일시
                endDate: row[5] || '',                         // F: 근태종료일시
                type: row[6] || '',                            // G: 근태구분
                description: row[7] || '',                     // H: 근태사유
                reviewStatus: row[8] || '-',                   // I: 검토상태
                reviewDate: row[9] || '',                      // J: 검토처리일자
                approvalStatus: row[10] || '-',                // K: 승인상태
                approvalDate: row[11] || ''                    // L: 승인처리일자
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

function testDoGet() {
    const testEvent = {
        parameter: {
            action: 'lookup',
            department: '생산관리팀',
            name: '홍길동'
        }
    };

    const result = doGet(testEvent);
    Logger.log(result.getContent());
}
function quickTest() {
  const result = doPost({
    postData: {
      contents: JSON.stringify({
        action: 'lookup',
        department: '생산관리팀',
        name: '이미혜'
      })
    }
  });
  Logger.log(result.getContent());
}
function onFormSubmit(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const target = ss.getSheetByName('근태계 접수현황');

  // e.values 또는 e.namedValues로 값 구성 (예시는 e.values)
  const values = e.values; // 폼 응답 한 줄

  const nextRow = target.getLastRow() + 1;
  target.getRange(nextRow, 1, 1, values.length).setValues([values]);
}

function addJwaSujeongMissingAttendance() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = spreadsheet.getSheets();

  let sheet = null;

  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === SHEET_GID) {
      sheet = sheets[i];
      break;
    }
  }

  if (!sheet) {
    throw new Error('근태계 접수현황 시트를 찾을 수 없습니다.');
  }

  const rowData = [
    new Date(),                       // A 접수일자
    '생산관리팀',                     // B 소속
    '사원',                           // C 직위
    '좌수정',                         // D 성명
    '2026-09-16 09:00',              // E 근태발생일시
    '2026-09-16 14:30',              // F 근태종료일시
    '근태누락',                       // G 근태구분
    '입사일 근태누락'                 // H 사유
  ];

  sheet.appendRow(rowData);

  Logger.log('좌수정 근태누락 등록 완료');
}
