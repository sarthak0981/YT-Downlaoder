/**
 * TubeHarvest Pro - Main Frontend Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    // State
    let currentVideoData = null;
    let selectedMode = 'video'; // 'video' | 'audio'
    let selectedResolution = null; // object from videoData.resolutions
    let selectedAudio = null; // object from videoData.audio_options
    let isClippingEnabled = false;
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
    const videoPanel = document.getElementById('videoPanel');
    const audioPanel = document.getElementById('audioPanel');
    const videoFormatSelect = document.getElementById('videoFormatSelect');
    const resolutionsGrid = document.getElementById('resolutionsGrid');
    const audioOptionsGrid = document.getElementById('audioOptionsGrid');

    const clipToggle = document.getElementById('clipToggle');
    const clipControls = document.getElementById('clipControls');
    const startRange = document.getElementById('startRange');
    const endRange = document.getElementById('endRange');
    const sliderHighlight = document.getElementById('sliderHighlight');
    const timelineDuration = document.getElementById('timelineDuration');
    const startTimeInput = document.getElementById('startTimeInput');
    const endTimeInput = document.getElementById('endTimeInput');
    const setStartZero = document.getElementById('setStartZero');
    const setEndMax = document.getElementById('setEndMax');
    const clipDurationText = document.getElementById('clipDurationText');

    const startDownloadBtn = document.getElementById('startDownloadBtn');
    const downloadSummary = document.getElementById('downloadSummary');

    // Modal Elements
    const progressModal = document.getElementById('progressModal');
    const modalTitle = document.getElementById('modalTitle');
    const progressSpinner = document.getElementById('progressSpinner');
    const progressStage = document.getElementById('progressStage');
    const progressBar = document.getElementById('progressBar');
    const statPercent = document.getElementById('statPercent');
    const statSpeed = document.getElementById('statSpeed');
    const statEta = document.getElementById('statEta');
    const successBox = document.getElementById('successBox');
    const successFileName = document.getElementById('successFileName');
    const directDownloadLink = document.getElementById('directDownloadLink');
    const failBox = document.getElementById('failBox');
    const failReason = document.getElementById('failReason');
    const retryModalBtn = document.getElementById('retryModalBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');

    // History Elements
    const historySection = document.getElementById('historySection');
    const historyList = document.getElementById('historyList');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');

    // Initialize Local History
    renderHistory();

    // Event: Paste from clipboard
    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                videoUrlInput.value = text.trim();
                triggerFetch();
            }
        } catch (err) {
            videoUrlInput.focus();
        }
    });

    // Event: Quick Sample Links
    document.querySelectorAll('.quick-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            videoUrlInput.value = btn.dataset.sample;
            triggerFetch();
        });
    });

    // Event: Close Error Alert
    closeError.addEventListener('click', () => {
        errorAlert.classList.add('hidden');
    });

    // Event: Form Submit / Fetch Video
    urlForm.addEventListener('submit', (e) => {
        e.preventDefault();
        triggerFetch();
    });

    function showError(msg) {
        errorMessage.textContent = msg;
        errorAlert.classList.remove('hidden');
    }

    function hideError() {
        errorAlert.classList.add('hidden');
    }

    async function triggerFetch() {
        const url = videoUrlInput.value.trim();
        if (!url) return;

        hideError();
        detailsCard.classList.add('hidden');
        setLoadingState(true);

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
            populateVideoDetails(data);
            detailsCard.classList.remove('hidden');
            detailsCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (err) {
            showError(err.message || 'Failed to fetch video. Please check the URL.');
        } finally {
            setLoadingState(false);
        }
    }

    function setLoadingState(loading) {
        if (loading) {
            fetchBtn.disabled = true;
            fetchBtnText.classList.add('hidden');
            fetchSpinner.classList.remove('hidden');
        } else {
            fetchBtn.disabled = false;
            fetchBtnText.classList.remove('hidden');
            fetchSpinner.classList.add('hidden');
        }
    }

    // Populate Video Card & Options
    function populateVideoDetails(data) {
        videoThumb.src = data.thumbnail || '';
        videoDuration.textContent = data.duration_formatted || '00:00';
        videoTitle.textContent = data.title;
        videoChannel.textContent = data.uploader;
        videoViews.textContent = formatViews(data.view_count);

        // Highest available resolution badge
        const maxRes = (data.resolutions && data.resolutions.length > 0) ? data.resolutions[0].label : 'HD';
        maxResBadge.textContent = `Max: ${maxRes}`;

        // Populate Resolutions (No cap!)
        resolutionsGrid.innerHTML = '';
        if (data.resolutions && data.resolutions.length > 0) {
            data.resolutions.forEach((res, index) => {
                const card = document.createElement('div');
                card.className = `res-card ${index === 0 ? 'active' : ''}`;
                card.dataset.height = res.height;
                card.innerHTML = `
                    <div class="res-header">
                        <span class="res-title">${res.resolution}</span>
                        <span class="res-badge">${res.quality_tag}</span>
                    </div>
                    <div class="res-sub">
                        <span>${res.fps > 30 ? res.fps + 'fps' : 'Standard FPS'}</span>
                        <span>${res.size_str}</span>
                    </div>
                `;
                card.addEventListener('click', () => {
                    document.querySelectorAll('.res-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                    selectedResolution = res;
                    updateDownloadSummary();
                });
                resolutionsGrid.appendChild(card);
            });
            selectedResolution = data.resolutions[0];
        } else {
            resolutionsGrid.innerHTML = `<p class="text-sm text-muted">Standard quality video streams available.</p>`;
            selectedResolution = { height: 720, label: '720p HD' };
        }

        // Populate Audio Options
        audioOptionsGrid.innerHTML = '';
        if (data.audio_options && data.audio_options.length > 0) {
            data.audio_options.forEach((opt, index) => {
                const card = document.createElement('div');
                card.className = `audio-card ${index === 0 ? 'active' : ''}`;
                card.dataset.id = opt.id;
                card.innerHTML = `
                    <div class="flex items-center justify-between">
                        <span class="font-bold text-sm text-light">${opt.label}</span>
                    </div>
                    <div class="text-xs text-muted mt-1 flex justify-between">
                        <span>Format: .${opt.format.toUpperCase()}</span>
                        <span>${opt.size_str}</span>
                    </div>
                `;
                card.addEventListener('click', () => {
                    document.querySelectorAll('.audio-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                    selectedAudio = opt;
                    updateDownloadSummary();
                });
                audioOptionsGrid.appendChild(card);
            });
            selectedAudio = data.audio_options[0];
        }

        // Setup Timeline Sliders
        const totalDuration = data.duration || 100;
        timelineDuration.textContent = formatSeconds(totalDuration);
        startRange.max = totalDuration;
        startRange.value = 0;
        endRange.max = totalDuration;
        endRange.value = totalDuration;
        startTimeInput.value = "00:00";
        endTimeInput.value = formatSeconds(totalDuration);

        updateSliderHighlight();
        updateClipDuration();
        updateDownloadSummary();
    }

    // Tab Switching: Video vs Audio
    tabVideo.addEventListener('click', () => {
        selectedMode = 'video';
        tabVideo.classList.add('active');
        tabAudio.classList.remove('active');
        videoPanel.classList.remove('hidden');
        audioPanel.classList.add('hidden');
        updateDownloadSummary();
    });

    tabAudio.addEventListener('click', () => {
        selectedMode = 'audio';
        tabAudio.classList.add('active');
        tabVideo.classList.remove('active');
        audioPanel.classList.remove('hidden');
        videoPanel.classList.add('hidden');
        updateDownloadSummary();
    });

    videoFormatSelect.addEventListener('change', updateDownloadSummary);

    // Clipping Toggle
    clipToggle.addEventListener('change', (e) => {
        isClippingEnabled = e.target.checked;
        if (isClippingEnabled) {
            clipControls.classList.remove('hidden');
        } else {
            clipControls.classList.add('hidden');
        }
        updateDownloadSummary();
    });

    // Timeline Slider Handlers
    function updateSliderHighlight() {
        const min = parseFloat(startRange.min) || 0;
        const max = parseFloat(startRange.max) || 100;
        const sVal = parseFloat(startRange.value);
        const eVal = parseFloat(endRange.value);

        const leftPct = ((sVal - min) / (max - min)) * 100;
        const widthPct = ((eVal - sVal) / (max - min)) * 100;

        sliderHighlight.style.left = `${leftPct}%`;
        sliderHighlight.style.width = `${Math.max(0, widthPct)}%`;
    }

    function updateClipDuration() {
        const sSec = parseTimeString(startTimeInput.value);
        const eSec = parseTimeString(endTimeInput.value);
        const diff = Math.max(0, eSec - sSec);
        clipDurationText.textContent = formatSeconds(diff);
    }

    startRange.addEventListener('input', () => {
        let sVal = parseFloat(startRange.value);
        let eVal = parseFloat(endRange.value);
        if (sVal > eVal - 1) {
            startRange.value = Math.max(0, eVal - 1);
            sVal = parseFloat(startRange.value);
        }
        startTimeInput.value = formatSeconds(sVal);
        updateSliderHighlight();
        updateClipDuration();
        updateDownloadSummary();
    });

    endRange.addEventListener('input', () => {
        let sVal = parseFloat(startRange.value);
        let eVal = parseFloat(endRange.value);
        if (eVal < sVal + 1) {
            endRange.value = Math.min(parseFloat(endRange.max), sVal + 1);
            eVal = parseFloat(endRange.value);
        }
        endTimeInput.value = formatSeconds(eVal);
        updateSliderHighlight();
        updateClipDuration();
        updateDownloadSummary();
    });

    startTimeInput.addEventListener('change', () => {
        const sec = parseTimeString(startTimeInput.value);
        const max = currentVideoData?.duration || 100;
        const bounded = Math.min(Math.max(0, sec), max);
        startRange.value = bounded;
        startTimeInput.value = formatSeconds(bounded);
        updateSliderHighlight();
        updateClipDuration();
        updateDownloadSummary();
    });

    endTimeInput.addEventListener('change', () => {
        const sec = parseTimeString(endTimeInput.value);
        const max = currentVideoData?.duration || 100;
        const bounded = Math.min(Math.max(0, sec), max);
        endRange.value = bounded;
        endTimeInput.value = formatSeconds(bounded);
        updateSliderHighlight();
        updateClipDuration();
        updateDownloadSummary();
    });

    setStartZero.addEventListener('click', () => {
        startRange.value = 0;
        startTimeInput.value = "00:00";
        updateSliderHighlight();
        updateClipDuration();
        updateDownloadSummary();
    });

    setEndMax.addEventListener('click', () => {
        const max = currentVideoData?.duration || 100;
        endRange.value = max;
        endTimeInput.value = formatSeconds(max);
        updateSliderHighlight();
        updateClipDuration();
        updateDownloadSummary();
    });

    // Preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = btn.dataset.preset;
            const max = currentVideoData?.duration || 100;
            startRange.value = 0;
            startTimeInput.value = "00:00";

            if (preset === 'full') {
                endRange.value = max;
            } else if (preset === '30s') {
                endRange.value = Math.min(30, max);
            } else if (preset === '60s') {
                endRange.value = Math.min(60, max);
            } else if (preset === '300s') {
                endRange.value = Math.min(300, max);
            }
            endTimeInput.value = formatSeconds(endRange.value);
            updateSliderHighlight();
            updateClipDuration();
            updateDownloadSummary();
        });
    });

    function updateDownloadSummary() {
        if (!currentVideoData) return;

        let desc = '';
        if (selectedMode === 'video') {
            const res = selectedResolution ? selectedResolution.resolution : 'Best';
            const fmt = videoFormatSelect.value.toUpperCase();
            desc = `${res} ${fmt}`;
        } else {
            const fmt = selectedAudio ? selectedAudio.format.toUpperCase() : 'MP3';
            const bit = selectedAudio ? selectedAudio.bitrate : '320k';
            desc = `${fmt} Audio (${bit})`;
        }

        if (isClippingEnabled) {
            const s = startTimeInput.value;
            const e = endTimeInput.value;
            desc += ` • Clip [${s} → ${e}]`;
        }

        downloadSummary.textContent = desc;
    }

    // Start Download Process
    startDownloadBtn.addEventListener('click', async () => {
        if (!currentVideoData) return;

        // Reset & Open Modal
        modalTitle.textContent = "Processing Media";
        progressStage.textContent = "Initiating stream download...";
        progressBar.style.width = "0%";
        statPercent.textContent = "0%";
        statSpeed.textContent = "--";
        statEta.textContent = "--";
        progressSpinner.classList.remove('hidden');
        successBox.classList.add('hidden');
        failBox.classList.add('hidden');
        closeModalBtn.classList.add('hidden');

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
            start_time: isClippingEnabled ? startTimeInput.value : null,
            end_time: isClippingEnabled ? endTimeInput.value : null,
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
            showModalFailure(err.message);
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

        progressBar.style.width = `${progress}%`;
        statPercent.textContent = `${progress}%`;
        statSpeed.textContent = task.speed || '--';
        statEta.textContent = task.eta || '--';
        progressStage.textContent = task.stage || 'Downloading...';

        if (status === 'completed') {
            if (currentEventSource) currentEventSource.close();
            showModalSuccess(task);
            saveToHistory(task);
        } else if (status === 'failed') {
            if (currentEventSource) currentEventSource.close();
            showModalFailure(task.error || 'Video processing failed.');
        }
    }

    function showModalSuccess(task) {
        progressSpinner.classList.add('hidden');
        modalTitle.textContent = "Download Ready!";
        progressStage.textContent = "File processed successfully.";
        successFileName.textContent = task.filename || "media_file";
        
        const fileUrl = `/api/file/${task.id}`;
        directDownloadLink.href = fileUrl;
        directDownloadLink.setAttribute('download', task.filename || 'download');

        successBox.classList.remove('hidden');
        closeModalBtn.classList.remove('hidden');

        // Automatically trigger browser download on user's local machine!
        const autoLink = document.createElement('a');
        autoLink.href = fileUrl;
        autoLink.download = task.filename || 'download';
        document.body.appendChild(autoLink);
        autoLink.click();
        document.body.removeChild(autoLink);
    }

    function showModalFailure(errMessage) {
        progressSpinner.classList.add('hidden');
        modalTitle.textContent = "Download Failed";
        failReason.textContent = errMessage;
        failBox.classList.remove('hidden');
        closeModalBtn.classList.remove('hidden');
    }

    closeModalBtn.addEventListener('click', () => {
        if (currentEventSource) currentEventSource.close();
        progressModal.close();
    });

    retryModalBtn.addEventListener('click', () => {
        if (currentEventSource) currentEventSource.close();
        progressModal.close();
    });

    // History Storage Handling
    function saveToHistory(task) {
        try {
            const item = {
                id: task.id,
                title: currentVideoData?.title || 'YouTube Media',
                filename: task.filename,
                size: task.file_size || 'Done',
                type: selectedMode.toUpperCase(),
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            let list = JSON.parse(localStorage.getItem('th_history') || '[]');
            list.unshift(item);
            if (list.length > 10) list = list.slice(0, 10);
            localStorage.setItem('th_history', JSON.stringify(list));
            renderHistory();
        } catch (e) {}
    }

    function renderHistory() {
        try {
            const list = JSON.parse(localStorage.getItem('th_history') || '[]');
            if (list.length === 0) {
                historySection.classList.add('hidden');
                return;
            }
            historyList.innerHTML = '';
            list.forEach(item => {
                const el = document.createElement('div');
                el.className = 'history-item';
                el.innerHTML = `
                    <div class="min-w-0 flex-1">
                        <div class="history-title truncate">${item.title}</div>
                        <div class="history-meta">${item.type} • ${item.size} • ${item.time}</div>
                    </div>
                    <a href="/api/file/${item.id}" download="${item.filename}" class="btn-redownload">
                        Re-save
                    </a>
                `;
                historyList.appendChild(el);
            });
            historySection.classList.remove('hidden');
        } catch (e) {}
    }

    clearHistoryBtn.addEventListener('click', () => {
        localStorage.removeItem('th_history');
        renderHistory();
    });
});
