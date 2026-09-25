/**
 * TubeHarvest Pro - Premium Frontend Controller
 */

document.addEventListener('DOMContentLoaded', () => {
    // State
    let currentVideoData = null;
    let selectedMode = 'video'; // 'video' | 'audio'
    let selectedResolution = null;
    let selectedAudio = null;
    let isClippingEnabled = false;
    let startSeconds = 0;
    let endSeconds = 0;
    let totalDuration = 0;
    let currentEventSource = null;

    // DOM Elements
    const urlForm = document.getElementById('urlForm');
    const videoUrlInput = document.getElementById('videoUrl');
    const pasteBtn = document.getElementById('pasteBtn');
    const fetchBtn = document.getElementById('fetchBtn');
    const fetchBtnText = document.getElementById('fetchBtnText');
    const fetchSpinner = document.getElementById('fetchSpinner');
    const errorAlert = document.getElementById('errorAlert');
    const errorMessage = document.getElementById('errorMessage');
    const closeError = document.getElementById('closeError');

    const detailsCard = document.getElementById('detailsCard');
    const videoThumb = document.getElementById('videoThumb');
    const videoDuration = document.getElementById('videoDuration');
    const videoTitle = document.getElementById('videoTitle');
    const videoChannel = document.getElementById('videoChannel');
    const videoViews = document.getElementById('videoViews');
    const maxResBadge = document.getElementById('maxResBadge');

    const tabVideo = document.getElementById('tabVideo');
    const tabAudio = document.getElementById('tabAudio');
    const videoPane = document.getElementById('videoPane');
    const audioPane = document.getElementById('audioPane');
    const videoFormatSelect = document.getElementById('videoFormatSelect');
    const resolutionsList = document.getElementById('resolutionsList');
    const audioList = document.getElementById('audioList');

    const trimmerToggleRow = document.getElementById('trimmerToggleRow');
    const clipToggle = document.getElementById('clipToggle');
    const trimmerPanel = document.getElementById('trimmerPanel');
    const timelineHighlight = document.getElementById('timelineHighlight');
    const startTimeInput = document.getElementById('startTimeInput');
    const endTimeInput = document.getElementById('endTimeInput');
    const startSecLabel = document.getElementById('startSecLabel');
    const endSecLabel = document.getElementById('endSecLabel');
    const clipDurationDisplay = document.getElementById('clipDurationDisplay');

    const downloadTargetSummary = document.getElementById('downloadTargetSummary');
    const startDownloadBtn = document.getElementById('startDownloadBtn');

    // Modal
    const progressModal = document.getElementById('progressModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalStage = document.getElementById('modalStage');
    const modalProgressFill = document.getElementById('modalProgressFill');
    const statPct = document.getElementById('statPct');
    const statSpeed = document.getElementById('statSpeed');
    const statEta = document.getElementById('statEta');
    const modalReadyBox = document.getElementById('modalReadyBox');
    const readyFileName = document.getElementById('readyFileName');
    const btnSaveDirect = document.getElementById('btnSaveDirect');
    const modalDismissBtn = document.getElementById('modalDismissBtn');
    const closeModalCross = document.getElementById('closeModalCross');
    const modalErrorBox = document.getElementById('modalErrorBox');
    const modalErrorMsg = document.getElementById('modalErrorMsg');
    const modalRetryBtn = document.getElementById('modalRetryBtn');

    // Clipboard Paste
    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                videoUrlInput.value = text.trim();
                triggerFetch();
            }
        } catch (e) {
            videoUrlInput.focus();
        }
    });

    // Sample Chips
    document.querySelectorAll('.sample-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            videoUrlInput.value = btn.dataset.url;
            triggerFetch();
        });
    });

    // Close Error Banner
    closeError.addEventListener('click', () => {
        errorAlert.style.display = 'none';
    });

    function showError(msg) {
        errorMessage.textContent = msg;
        errorAlert.style.display = 'flex';
    }

    function hideError() {
        errorAlert.style.display = 'none';
    }

    // Form Submit
    urlForm.addEventListener('submit', (e) => {
        e.preventDefault();
        triggerFetch();
    });

    async function triggerFetch() {
        const url = videoUrlInput.value.trim();
        if (!url) return;

        hideError();
        detailsCard.classList.remove('active');
        fetchBtn.disabled = true;
        fetchBtnText.style.display = 'none';
        fetchSpinner.style.display = 'inline-block';

        try {
            const res = await fetch('/api/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.detail || 'Could not fetch video details.');
            }

            currentVideoData = data;
            populateUI(data);
            detailsCard.classList.add('active');
            detailsCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (err) {
            showError(err.message || 'Error connecting to video service.');
        } finally {
            fetchBtn.disabled = false;
            fetchBtnText.style.display = 'inline-block';
            fetchSpinner.style.display = 'none';
        }
    }

    function populateUI(data) {
        videoThumb.src = data.thumbnail || '';
        videoDuration.textContent = data.duration_formatted || '00:00';
        videoTitle.textContent = data.title;
        videoChannel.textContent = data.uploader;
        videoViews.textContent = formatViews(data.view_count);

        totalDuration = data.duration || 100;
        startSeconds = 0;
        endSeconds = totalDuration;

        // Highest resolution badge
        const maxLabel = (data.resolutions && data.resolutions.length > 0) ? data.resolutions[0].label : 'HD';
        maxResBadge.textContent = `Max: ${maxLabel}`;

        // Populate Resolutions (No resolution cap)
        resolutionsList.innerHTML = '';
        if (data.resolutions && data.resolutions.length > 0) {
            data.resolutions.forEach((res, index) => {
                const row = document.createElement('div');
                row.className = `option-row ${index === 0 ? 'selected' : ''}`;
                row.innerHTML = `
                    <div class="option-left">
                        <div class="radio-indicator"></div>
                        <div>
                            <span class="res-name">${res.resolution}</span>
                            <span class="res-tag" style="margin-left:6px;">${res.quality_tag}</span>
                            <span style="font-size:0.75rem;color:var(--text-muted);margin-left:6px;">${res.fps > 30 ? res.fps + 'fps' : ''}</span>
                        </div>
                    </div>
                    <div class="option-right">
                        <span>${res.size_str}</span>
                    </div>
                `;
                row.addEventListener('click', () => {
                    document.querySelectorAll('#resolutionsList .option-row').forEach(r => r.classList.remove('selected'));
                    row.classList.add('selected');
                    selectedResolution = res;
                    updateDownloadSummary();
                });
                resolutionsList.appendChild(row);
            });
            selectedResolution = data.resolutions[0];
        } else {
            resolutionsList.innerHTML = `<div style="font-size:0.85rem;color:var(--text-muted);padding:12px;">Standard formats available.</div>`;
            selectedResolution = { height: 720, resolution: '720p HD' };
        }

        // Populate Audio Options
        audioList.innerHTML = '';
        if (data.audio_options && data.audio_options.length > 0) {
            data.audio_options.forEach((opt, index) => {
                const card = document.createElement('div');
                card.className = `option-row ${index === 0 ? 'selected' : ''}`;
                card.innerHTML = `
                    <div class="option-left">
                        <div class="radio-indicator"></div>
                        <div>
                            <div class="res-name" style="font-size:0.9rem;">${opt.label}</div>
                            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">Format: .${opt.format.toUpperCase()}</div>
                        </div>
                    </div>
                    <div class="option-right">
                        <span>${opt.size_str}</span>
                    </div>
                `;
                card.addEventListener('click', () => {
                    document.querySelectorAll('#audioList .option-row').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    selectedAudio = opt;
                    updateDownloadSummary();
                });
                audioList.appendChild(card);
            });
            selectedAudio = data.audio_options[0];
        }

        // Reset Trimmer values
        startTimeInput.value = "00:00:00";
        endTimeInput.value = formatSeconds(totalDuration);
        clipToggle.checked = false;
        isClippingEnabled = false;
        trimmerPanel.classList.remove('active');
        updateTrimmerDisplay();
        updateDownloadSummary();
    }

    // Segmented Mode Switching
    tabVideo.addEventListener('click', () => {
        selectedMode = 'video';
        tabVideo.classList.add('active');
        tabAudio.classList.remove('active');
        videoPane.classList.add('active');
        audioPane.classList.remove('active');
        updateDownloadSummary();
    });

    tabAudio.addEventListener('click', () => {
        selectedMode = 'audio';
        tabAudio.classList.add('active');
        tabVideo.classList.remove('active');
        audioPane.classList.add('active');
        videoPane.classList.remove('active');
        updateDownloadSummary();
    });

    videoFormatSelect.addEventListener('change', updateDownloadSummary);

    // Trimmer Toggle
    trimmerToggleRow.addEventListener('click', () => {
        clipToggle.checked = !clipToggle.checked;
        handleClipToggle();
    });

    clipToggle.addEventListener('change', handleClipToggle);

    function handleClipToggle() {
        isClippingEnabled = clipToggle.checked;
        if (isClippingEnabled) {
            trimmerPanel.classList.add('active');
        } else {
            trimmerPanel.classList.remove('active');
        }
        updateDownloadSummary();
    }

    // Trimmer Stepper Controls
    document.querySelectorAll('.step-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            const delta = parseFloat(btn.dataset.delta) || 0;

            if (type === 'start') {
                startSeconds = Math.max(0, Math.min(totalDuration, startSeconds + delta));
                if (startSeconds >= endSeconds) {
                    startSeconds = Math.max(0, endSeconds - 1);
                }
                startTimeInput.value = formatSeconds(startSeconds);
            } else if (type === 'end') {
                endSeconds = Math.max(0, Math.min(totalDuration, endSeconds + delta));
                if (endSeconds <= startSeconds) {
                    endSeconds = Math.min(totalDuration, startSeconds + 1);
                }
                endTimeInput.value = formatSeconds(endSeconds);
            }

            updateTrimmerDisplay();
            updateDownloadSummary();
        });
    });

    startTimeInput.addEventListener('change', () => {
        const val = parseTimeString(startTimeInput.value);
        startSeconds = Math.max(0, Math.min(totalDuration, val));
        if (startSeconds >= endSeconds) {
            startSeconds = Math.max(0, endSeconds - 1);
        }
        startTimeInput.value = formatSeconds(startSeconds);
        updateTrimmerDisplay();
        updateDownloadSummary();
    });

    endTimeInput.addEventListener('change', () => {
        const val = parseTimeString(endTimeInput.value);
        endSeconds = Math.max(0, Math.min(totalDuration, val));
        if (endSeconds <= startSeconds) {
            endSeconds = Math.min(totalDuration, startSeconds + 1);
        }
        endTimeInput.value = formatSeconds(endSeconds);
        updateTrimmerDisplay();
        updateDownloadSummary();
    });

    // Preset Chips
    document.querySelectorAll('.preset-tag').forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = btn.dataset.preset;
            startSeconds = 0;
            startTimeInput.value = "00:00:00";

            if (preset === 'full') {
                endSeconds = totalDuration;
            } else {
                const targetSec = parseFloat(preset) || 30;
                endSeconds = Math.min(totalDuration, targetSec);
            }

            endTimeInput.value = formatSeconds(endSeconds);
            updateTrimmerDisplay();
            updateDownloadSummary();
        });
    });

    function updateTrimmerDisplay() {
        startSecLabel.textContent = `${Math.floor(startSeconds)}s`;
        endSecLabel.textContent = `${Math.floor(endSeconds)}s`;

        const diff = Math.max(0, endSeconds - startSeconds);
        clipDurationDisplay.textContent = formatSeconds(diff);

        if (totalDuration > 0) {
            const leftPct = (startSeconds / totalDuration) * 100;
            const widthPct = ((endSeconds - startSeconds) / totalDuration) * 100;
            timelineHighlight.style.left = `${Math.max(0, leftPct)}%`;
            timelineHighlight.style.width = `${Math.min(100, Math.max(1, widthPct))}%`;
        }
    }

    function updateDownloadSummary() {
        if (!currentVideoData) return;

        let summary = "";
        if (selectedMode === 'video') {
            const res = selectedResolution ? selectedResolution.resolution : 'Best Quality';
            const fmt = videoFormatSelect.value.toUpperCase();
            summary = `${res} (${fmt})`;
        } else {
            const fmt = selectedAudio ? selectedAudio.format.toUpperCase() : 'MP3';
            const bit = selectedAudio ? selectedAudio.bitrate : '320k';
            summary = `${fmt} Audio (${bit})`;
        }

        if (isClippingEnabled) {
            summary += ` • Clip [${startTimeInput.value} → ${endTimeInput.value}]`;
        }

        downloadTargetSummary.textContent = summary;
    }

    // Start Download Execution
    startDownloadBtn.addEventListener('click', async () => {
        if (!currentVideoData) return;

        // Reset and Open Modal
        modalTitle.textContent = "Processing Download";
        modalStage.textContent = "Connecting to YouTube stream...";
        modalProgressFill.style.width = "0%";
        statPct.textContent = "0%";
        statSpeed.textContent = "--";
        statEta.textContent = "--";
        modalReadyBox.style.display = "none";
        modalErrorBox.style.display = "none";

        if (typeof progressModal.showModal === 'function') {
            progressModal.showModal();
        } else {
            progressModal.setAttribute('open', '');
        }

        const payload = {
            url: currentVideoData.url,
            type: selectedMode,
            height: selectedMode === 'video' ? selectedResolution?.height : null,
            format: selectedMode === 'video' ? videoFormatSelect.value : selectedAudio?.format,
            audio_bitrate: selectedAudio ? selectedAudio.bitrate : '320k',
            start_time: isClippingEnabled ? startSeconds : null,
            end_time: isClippingEnabled ? endSeconds : null,
            title: currentVideoData.title
        };

        try {
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || 'Download request failed.');
            }

            listenToProgress(data.task_id);
        } catch (err) {
            showModalError(err.message);
        }
    });

    function listenToProgress(taskId) {
        if (currentEventSource) {
            currentEventSource.close();
        }

        currentEventSource = new EventSource(`/api/progress/${taskId}`);

        currentEventSource.addEventListener('progress', (e) => {
            const task = JSON.parse(e.data);
            handleProgressUpdate(task);
        });

        currentEventSource.addEventListener('error', () => {
            currentEventSource.close();
        });
    }

    function handleProgressUpdate(task) {
        if (!task) return;

        const status = task.status;
        const progress = Math.min(100, Math.max(0, task.progress || 0));

        modalProgressFill.style.width = `${progress}%`;
        statPct.textContent = `${Math.floor(progress)}%`;
        statSpeed.textContent = task.speed || '--';
        statEta.textContent = task.eta || '--';
        modalStage.textContent = task.stage || 'Processing stream...';

        if (status === 'completed') {
            if (currentEventSource) currentEventSource.close();
            showModalSuccess(task);
        } else if (status === 'failed') {
            if (currentEventSource) currentEventSource.close();
            showModalError(task.error || 'Processing failed.');
        }
    }

    function showModalSuccess(task) {
        modalTitle.textContent = "Download Ready!";
        modalStage.textContent = "Media successfully processed.";
        readyFileName.textContent = task.filename || "media_file";
        
        const fileUrl = `/api/file/${task.id}`;
        btnSaveDirect.href = fileUrl;
        btnSaveDirect.setAttribute('download', task.filename || 'download');

        modalReadyBox.style.display = "block";

        // Auto trigger download to local device
        const a = document.createElement('a');
        a.href = fileUrl;
        a.download = task.filename || 'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function showModalError(errMsg) {
        modalTitle.textContent = "Error Occurred";
        modalErrorMsg.textContent = errMsg;
        modalErrorBox.style.display = "block";
    }

    modalDismissBtn.addEventListener('click', () => progressModal.close());
    closeModalCross.addEventListener('click', () => progressModal.close());
    modalRetryBtn.addEventListener('click', () => progressModal.close());
});
