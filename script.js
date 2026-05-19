import { $, state, driveImgFallback } from './js/core.js';
import { registerRefreshers, showPage, refreshCurrent, openModal, closeModal } from './js/ui.js';
import { checkConn, saveConfig, testConn, loadRemoteSettings, renderEvaluationSelects, calcTotalScore, loadDashboard } from './js/dashboard.js';
import { loadEquipment, filterEquipList, openEquipForm, openEquipDetail, enableEditMode, saveEquipment, confirmDeleteEquip, uploadEquipPhoto, removeEquipPhoto, exportEquipToCSV, openHistorySlideOver, closeHistorySlideOver, submitHistoryAction, deleteHistoryReport, showQR, loadEquipFormParts, addEquipFormPart, toggleEquipIdle, setEquipTab, togglePMTarget, loadEquipSubItems, addEquipSubItem, deleteEquipSubItem, uploadSubItemPhoto, updateSubItemPhoto, openPhotoModal } from './js/equipment.js';
import { loadReports, openReportModal, submitAction, uploadReportPhoto, removeReportPhoto, openReportNewModal, submitNewReport, renderReportBoard, addReportYear } from './js/reports.js';
import { loadParts, renderPartsList, showPartUsage, openPartsMasterForm, savePartsMaster, openPartsIn, savePartsIn, openPartsOut, savePartsOut, openPartsEquipLink, renderPELList, filterPELList, togglePELSuggest, removePELLink, savePartsEquipLink, openPartsHistory, closePartsHistory, syncPartsPhotoPreview, uploadPartsPhoto, removePartsPhoto } from './js/parts.js';
import { loadPMMasterList, openPMMasterForm, savePMMasterItem, editPMMasterItem, deletePMMasterItem, loadPMPlan, addNewYear, savePMPlans, openPMEdit, savePMEditSingle, ensureYearOptions, cyclePMStatus, cyclePMOverviewCell, saveAllPMResults, setPMPlanDate, loadPMResultsForEquip, openPMResultHistory, closePMResultHistory, renderPMEquipList, selectPMEquip, renderPMPlanEquipList, selectPMPlanEquip, renderPMPlanMonthGrid, savePMSingleEquip, savePMResultRow, saveRowResults, renderPMOverviewTable, updateCheckMonthSelect, openPMPlanSlideover, closePMPlanSlideover, setPMPlanDateFromSlide, savePMPlanFromSlideover, openPMResultEntry, closePMResultEntry, setPMEntryResult, savePMResultEntry, openPMChecksheet, savePMChecksheet, saveInlineItem, openCopyFromEquip, previewCopyItems, saveCopyFromEquip, renderChecksheetHistory, toggleChecksheetHistory, openChecksheetMonthDetail, openPMItemsModal, renderPMItemsTable, saveInlineItemModal, deletePMItemInModal, uploadPMItemPhoto, uploadAndUpdateItemPhoto, removePMItemPhoto, openPMHistoryModal, showPMHistoryList, openPMHistoryDetail, uploadPMChecksheetPhoto, openPMResultEdit, savePMResultEdit, deletePMResultRow, deletePMResultMonth } from './js/pm.js';
import { loadStats } from './js/stats.js';

function bindGlobals() {
  Object.assign(window, {
    showPage,
    refreshCurrent,
    openModal,
    closeModal,
    filterEquipList,
    exportEquipToCSV,
    openEquipForm,
    openEquipDetail,
    enableEditMode,
    saveEquipment,
    confirmDeleteEquip,
    uploadEquipPhoto,
    removeEquipPhoto,
    openReportModal,
    submitAction,
    uploadReportPhoto,
    removeReportPhoto,
    openReportNewModal,
    submitNewReport,
    renderReportBoard,
    addReportYear,
    loadParts,
    renderPartsList,
    showPartUsage,
    openPartsEquipLink,
    renderPELList,
    filterPELList,
    togglePELSuggest,
    removePELLink,
    savePartsEquipLink,
    openPartsHistory,
    closePartsHistory,
    openPartsMasterForm,
    savePartsMaster,
    openPartsIn,
    savePartsIn,
    openPartsOut,
    savePartsOut,
    loadPMPlan,
    addNewYear,
    savePMPlans,
    openPMEdit,
    savePMEditSingle,
    loadPMMasterList,
    openPMMasterForm,
    savePMMasterItem,
    editPMMasterItem,
    deletePMMasterItem,
    cyclePMStatus,
    cyclePMOverviewCell,
    saveAllPMResults,
    setPMPlanDate,
    loadPMResultsForEquip,
    openPMResultHistory,
    closePMResultHistory,
    renderPMEquipList,
    selectPMEquip,
    renderPMPlanEquipList,
    selectPMPlanEquip,
    renderPMPlanMonthGrid,
    savePMSingleEquip,
    savePMResultRow,
    saveRowResults,
    renderPMOverviewTable,
    openPMPlanSlideover,
    closePMPlanSlideover,
    setPMPlanDateFromSlide,
    savePMPlanFromSlideover,
    openPMResultEntry,
    closePMResultEntry,
    setPMEntryResult,
    savePMResultEntry,
    openHistorySlideOver,
    closeHistorySlideOver,
    submitHistoryAction,
    deleteHistoryReport,
    showQR,
    loadEquipFormParts,
    addEquipFormPart,
    loadEquipSubItems,
    addEquipSubItem,
    deleteEquipSubItem,
    uploadSubItemPhoto,
    updateSubItemPhoto,
    openPhotoModal,
    syncPartsPhotoPreview,
    uploadPartsPhoto,
    removePartsPhoto,
    saveConfig,
    testConn,
    calcTotalScore,
    toggleEquipIdle,
    setEquipTab,
    togglePMTarget,
    updateCheckMonthSelect,
    openPMChecksheet,
    savePMChecksheet,
    saveInlineItem,
    openCopyFromEquip,
    previewCopyItems,
    saveCopyFromEquip,
    renderChecksheetHistory,
    toggleChecksheetHistory,
    openChecksheetMonthDetail,
    openPMItemsModal,
    renderPMItemsTable,
    saveInlineItemModal,
    deletePMItemInModal,
    uploadPMItemPhoto,
    uploadAndUpdateItemPhoto,
    removePMItemPhoto,
    openPMHistoryModal,
    showPMHistoryList,
    openPMHistoryDetail,
    uploadPMChecksheetPhoto,
    openPMResultEdit,
    savePMResultEdit,
    deletePMResultRow,
    deletePMResultMonth,
    driveImgFallback,
  });
}

async function init() {
  registerRefreshers({
    'page-dashboard': loadDashboard,
    'page-equip-list': loadEquipment,
    'page-reports': loadReports,
    'page-spare-parts': loadParts,
    'page-pm-plan': async () => { await Promise.allSettled([loadPMPlan(), loadPMMasterList()]); },
    'page-stats': loadStats,
  });
  bindGlobals();
  renderEvaluationSelects();
  ensureYearOptions();
  await loadRemoteSettings();
  if ($('cfg-base-url')) $('cfg-base-url').value = state.baseUrl;
  await checkConn();
  await Promise.allSettled([loadEquipment(), loadReports()]);
  await loadDashboard();
}

document.addEventListener('DOMContentLoaded', () => {
  init().then(() => {
    // 화면별 폴링 주기 (ms)
    const POLL_INTERVALS = {
      'page-reports':     10000,
      'page-dashboard':   20000,
      'page-spare-parts': 20000,
      'page-equip-list':  30000,
      'page-pm-plan':     60000,
      'page-pm-master':   60000,
      'page-stats':       60000,
    };

    // 모달 열려있는지 확인 (편집 중 갱신 방지)
    function isModalOpen() {
      return !!document.querySelector('[id^="modal-"].open');
    }

    let _lastPoll = 0;

    // 5초마다 체크 — 화면별 주기 조건 충족 시에만 실제 갱신
    setInterval(() => {
      if (document.hidden || isModalOpen()) return;
      const interval = POLL_INTERVALS[state.currentPage] ?? 30000;
      if (Date.now() - _lastPoll < interval) return;
      _lastPoll = Date.now();
      refreshCurrent();
      // 현재 페이지가 reports가 아닐 때도 뱃지 카운트 유지
      if (state.currentPage !== 'page-reports') loadReports().catch(() => {});
    }, 5000);

    // 브라우저 탭 복귀 시 즉시 갱신 (모달 없을 때만)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !isModalOpen()) {
        _lastPoll = 0;
        refreshCurrent();
      }
    });
  }).catch((error) => {
    console.error(error);
  });
});
