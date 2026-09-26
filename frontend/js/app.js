/**
 * TubeHarvest Pro - Professional Frontend Controller
 */

document.addEventListener('DOMContentLoaded', () => {
    // Application State
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

    const clipToggleBtn = document.getElementById('clipToggleBtn');
    const clipToggleThumb = document.getElementById('clipToggleThumb');
    const trimmerPanel = document.getElementById('trimmerPanel');
    const timelineHighlight = document.getElementById('timelineHighlight');
    const startTimeInput = document.getElementById('startTimeInput');
    const endTimeInput = document.getElementById('endTimeInput');
    const startSecLabel = document.getElementById('startSecLabel');
    const endSecLabel = document.getElementById('endSecLabel');
    const clipDurationDisplay = document.getElementById('clipDurationDisplay');

    const downloadTargetSummary = document.getElementById('downloadTargetSummary');
    const startDownloadBtn = document.getElementById('startDownloadBtn');

    // Modal Elements
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

    // Clipboard Paste Helper
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

    // Sample Link Buttons
    document.querySelectorAll('.sample-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            videoUrlInput.value = btn.dataset.url;
            triggerFetch();
        });
    });

    // Error Alert Dismiss
    closeError.addEventListener('click', () => {
        errorAlert.classList.add('hidden');
    });

    function showError(msg) {
        errorMessage.textContent = msg;
        errorAlert.classList.remove('hidden');
    }

    function hideError() {
        errorAlert.classList.add('hidden');
    }

    // Submit URL Form
    urlForm.addEventListener('submit', (e) => {
        e.preventDefault();
        triggerFetch();
    });

    async function triggerFetch() {
        const url = videoUrlInput.value.trim();
        if (!url) return;

        hideError();
        detailsCard.classList.add('hidden');
        fetchBtn.disabled = true;
        fetchBtnText.classList.add('hidden');
        fetchSpinner.classList.remove('hidden');

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
            detailsCard.classList.remove('hidden');
            detailsCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (err) {
            showError(err.message || 'Failed to fetch video details.');
        } finally {
            fetchBtn.disabled = false;
            fetchBtnText.classList.remove('hidden');
            fetchSpinner.classList.add('hidden');
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

        // Reset Trimmer State
        isClippingEnabled = false;
        updateClipToggleUI();

        // Max Resolution Badge
        const maxLabel = (data.resolutions && data.resolutions.length > 0) ? data.resolutions[0].label : 'HD';
        maxResBadge.textContent = `Max: ${maxLabel}`;

        renderResolutions();
        renderAudioOptions();
        updateTrimmerDisplay();
        updateDownloadSummary();
    }

    // Render Video Resolution Options
    function renderResolutions() {
        resolutionsList.innerHTML = '';
        if (currentVideoData.resolutions && currentVideoData.resolutions.length > 0) {
            currentVideoData.resolutions.forEach((res, index) => {
                const row = document.createElement('div');
                row.className = `option-row flex items-center justify-between p-3.5 bg-zinc-950 border rounded-xl cursor-pointer transition-all ${index === 0 ? 'border-rose-500 bg-rose-500/5' : 'border-zinc-800 hover:border-zinc-700'}`;
                row.dataset.height = res.height;
                
                const activeDuration = isClippingEnabled ? Math.max(1, endSeconds - startSeconds) : totalDuration;
                const dynamicSize = formatBytes(Math.round(activeDuration * res.bytes_per_sec));

                row.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="radio-circle w-4 h-4 rounded-full border-2 flex items-center justify-center ${index === 0 ? 'border-rose-500 bg-rose-500' : 'border-zinc-600'}">
                            <span class="w-1.5 h-1.5 rounded-full bg-white ${index === 0 ? '' : 'hidden'}"></span>
                        </div>
                        <div>
                            <span class="font-bold text-sm text-white">${res.resolution}</span>
                            <span class="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">${res.quality_tag}</span>
                            <span class="ml-1.5 text-xs text-zinc-500">${res.fps > 30 ? res.fps + 'fps' : ''}</span>
                        </div>
                    </div>
                    <div class="res-size font-mono text-xs text-zinc-400">
                        ${dynamicSize}
                    </div>
                `;

                row.addEventListener('click', () => {
                    document.querySelectorAll('#resolutionsList .option-row').forEach(r => {
                        r.classList.remove('border-rose-500', 'bg-rose-500/5');
                        r.classList.add('border-zinc-800');
                        r.querySelector('.radio-circle').className = 'radio-circle w-4 h-4 rounded-full border-2 border-zinc-600 flex items-center justify-center';
                        r.querySelector('.radio-circle span').classList.add('hidden');
                    });

                    row.classList.remove('border-zinc-800');
                    row.classList.add('border-rose-500', 'bg-rose-500/5');
                    row.querySelector('.radio-circle').className = 'radio-circle w-4 h-4 rounded-full border-2 border-rose-500 bg-rose-500 flex items-center justify-center';
                    row.querySelector('.radio-circle span').classList.remove('hidden');

                    selectedResolution = res;
                    updateDownloadSummary();
                });

                resolutionsList.appendChild(row);
            });
            selectedResolution = currentVideoData.resolutions[0];
        }
    }

    // Render Audio Options
    function renderAudioOptions() {
        audioList.innerHTML = '';
        if (currentVideoData.audio_options && currentVideoData.audio_options.length > 0) {
            currentVideoData.audio_options.forEach((opt, index) => {
                const card = document.createElement('div');
                card.className = `audio-row flex items-center justify-between p-3.5 bg-zinc-950 border rounded-xl cursor-pointer transition-all ${index === 0 ? 'border-rose-500 bg-rose-500/5' : 'border-zinc-800 hover:border-zinc-700'}`;
                
                const activeDuration = isClippingEnabled ? Math.max(1, endSeconds - startSeconds) : totalDuration;
                const dynamicSize = formatBytes(Math.round(activeDuration * opt.bytes_per_sec));

                card.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="radio-circle w-4 h-4 rounded-full border-2 flex items-center justify-center ${index === 0 ? 'border-rose-500 bg-rose-500' : 'border-zinc-600'}">
                            <span class="w-1.5 h-1.5 rounded-full bg-white ${index === 0 ? '' : 'hidden'}"></span>
                        </div>
                        <div>
                            <div class="font-bold text-xs sm:text-sm text-white">${opt.label}</div>
                            <div class="text-[10px] text-zinc-500 mt-0.5">Format: .${opt.format.toUpperCase()}</div>
                        </div>
                    </div>
                    <div class="audio-size font-mono text-xs text-zinc-400">
                        ${dynamicSize}
                    </div>
                `;

                card.addEventListener('click', () => {
                    document.querySelectorAll('#audioList .audio-row').forEach(c => {
                        c.classList.remove('border-rose-500', 'bg-rose-500/5');
                        c.classList.add('border-zinc-800');
                        c.querySelector('.radio-circle').className = 'radio-circle w-4 h-4 rounded-full border-2 border-zinc-600 flex items-center justify-center';
                        c.querySelector('.radio-circle span').classList.add('hidden');
                    });

                    card.classList.remove('border-zinc-800');
                    card.classList.add('border-rose-500', 'bg-rose-500/5');
                    card.querySelector('.radio-circle').className = 'radio-circle w-4 h-4 rounded-full border-2 border-rose-500 bg-rose-500 flex items-center justify-center';
                    card.querySelector('.radio-circle span').classList.remove('hidden');

                    selectedAudio = opt;
                    updateDownloadSummary();
                });

                audioList.appendChild(card);
            });
            selectedAudio = currentVideoData.audio_options[0];
        }
    }

    // Update dynamically calculated sizes on all cards based on clip or full video
    function updateOptionSizes() {
        if (!currentVideoData) return;
        const activeDuration = isClippingEnabled ? Math.max(1, endSeconds - startSeconds) : totalDuration;

        // Update video options
        const resRows = document.querySelectorAll('#resolutionsList .option-row');
        currentVideoData.resolutions.forEach((res, i) => {
            if (resRows[i]) {
                const sizeEl = resRows[i].querySelector('.res-size');
                if (sizeEl) {
                    sizeEl.textContent = formatBytes(Math.round(activeDuration * res.bytes_per_sec));
                }
            }
        });

        // Update audio options
        const audioRows = document.querySelectorAll('#audioList .audio-row');
        currentVideoData.audio_options.forEach((opt, i) => {
            if (audioRows[i]) {
                const sizeEl = audioRows[i].querySelector('.audio-size');
                if (sizeEl) {
                    sizeEl.textContent = formatBytes(Math.round(activeDuration * opt.bytes_per_sec));
                }
            }
        });
    }

    // Segmented Mode Switching
    tabVideo.addEventListener('click', () => {
        selectedMode = 'video';
        tabVideo.className = 'tab-transition py-2.5 rounded-lg flex items-center justify-center gap-2 bg-zinc-800 text-white shadow-sm';
        tabAudio.className = 'tab-transition py-2.5 rounded-lg flex items-center justify-center gap-2 text-zinc-400 hover:text-zinc-200';
        videoPane.classList.remove('hidden');
        audioPane.classList.add('hidden');
        updateDownloadSummary();
    });

    tabAudio.addEventListener('click', () => {
        selectedMode = 'audio';
        tabAudio.className = 'tab-transition py-2.5 rounded-lg flex items-center justify-center gap-2 bg-zinc-800 text-white shadow-sm';
        tabVideo.className = 'tab-transition py-2.5 rounded-lg flex items-center justify-center gap-2 text-zinc-400 hover:text-zinc-200';
        audioPane.classList.remove('hidden');
        videoPane.classList.add('hidden');
        updateDownloadSummary();
    });

    videoFormatSelect.addEventListener('change', updateDownloadSummary);

    // Toggle Clipping Button (Clean, isolated click listener)
    clipToggleBtn.addEventListener('click', () => {
        isClippingEnabled = !isClippingEnabled;
        updateClipToggleUI();
        updateDownloadSummary();
        updateOptionSizes();
    });

    function updateClipToggleUI() {
        if (isClippingEnabled) {
            clipToggleBtn.classList.remove('bg-zinc-800');
            clipToggleBtn.classList.add('bg-rose-600', 'border-rose-500');
            clipToggleThumb.classList.remove('left-1', 'bg-zinc-400');
            clipToggleThumb.classList.add('right-1', 'bg-white');
            trimmerPanel.classList.remove('hidden');
        } else {
            clipToggleBtn.classList.remove('bg-rose-600', 'border-rose-500');
            clipToggleBtn.classList.add('bg-zinc-800');
            clipToggleThumb.classList.remove('right-1', 'bg-white');
            clipToggleThumb.classList.add('left-1', 'bg-zinc-400');
            trimmerPanel.classList.add('hidden');
        }
    }

    // Stepper Handlers for Start and End points
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
            updateOptionSizes();
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
        updateOptionSizes();
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
        updateOptionSizes();
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
            updateOptionSizes();
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
        const activeDuration = isClippingEnabled ? Math.max(1, endSeconds - startSeconds) : totalDuration;

        if (selectedMode === 'video') {
            const res = selectedResolution ? selectedResolution.resolution : 'Best';
            const fmt = videoFormatSelect.value.toUpperCase();
            const est = selectedResolution ? formatBytes(Math.round(activeDuration * selectedResolution.bytes_per_sec)) : '';
            summary = `${res} (${fmt}) • ~${est}`;
        } else {
            const fmt = selectedAudio ? selectedAudio.format.toUpperCase() : 'MP3';
            const bit = selectedAudio ? selectedAudio.bitrate : '320k';
            const est = selectedAudio ? formatBytes(Math.round(activeDuration * selectedAudio.bytes_per_sec)) : '';
            summary = `${fmt} Audio (${bit}) • ~${est}`;
        }

        if (isClippingEnabled) {
            summary += ` [Clip: ${startTimeInput.value} → ${endTimeInput.value}]`;
        }

        downloadTargetSummary.textContent = summary;
    }

    // Trigger Download Process
    startDownloadBtn.addEventListener('click', async () => {
        if (!currentVideoData) return;

        // Reset and Open Modal
        modalTitle.textContent = "Processing Download";
        modalStage.textContent = "Connecting to stream server...";
        modalProgressFill.style.width = "0%";
        statPct.textContent = "0%";
        statSpeed.textContent = "--";
        statEta.textContent = "--";
        modalReadyBox.classList.add('hidden');
        modalErrorBox.classList.add('hidden');

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
        modalStage.textContent = task.stage || 'Processing media...';

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
        modalStage.textContent = "File processed successfully.";
        readyFileName.textContent = task.filename || "media_file";

        const fileUrl = `/api/file/${task.id}`;
        btnSaveDirect.href = fileUrl;
        btnSaveDirect.setAttribute('download', task.filename || 'download');

        modalReadyBox.classList.remove('hidden');

        // Automatically trigger browser download on user's device
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
        modalErrorBox.classList.remove('hidden');
    }

    modalDismissBtn.addEventListener('click', () => progressModal.close());
    closeModalCross.addEventListener('click', () => progressModal.close());
    modalRetryBtn.addEventListener('click', () => progressModal.close());
});
