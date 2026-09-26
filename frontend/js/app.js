/**
 * TubeHarvest Pro - Minimalist Futuristic Frontend Controller
 * - Unambiguous Mode Switching
 * - Guaranteed Audio & Video Extraction
 * - Full-Res HD Thumbnail Downloader Utility
 * - Interactive Dual-Handle Scrubber
 * - Bulletproof Single-Task Polling
 */

// Self-contained utility fallbacks
if (typeof formatBytes !== 'function') {
    window.formatBytes = function(bytes) {
        if (!bytes || isNaN(bytes) || bytes <= 0) return "0 B";
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let val = Number(bytes);
        let unitIndex = 0;
        while (val >= 1024 && unitIndex < units.length - 1) {
            val /= 1024;
            unitIndex++;
        }
        return (unitIndex === 0 ? val : val.toFixed(1)) + ' ' + units[unitIndex];
    };
}

if (typeof formatSeconds !== 'function') {
    window.formatSeconds = function(seconds) {
        if (seconds === null || seconds === undefined || isNaN(seconds) || seconds < 0) return "00:00";
        const totalSecs = Math.floor(seconds);
        const hrs = Math.floor(totalSecs / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const secs = totalSecs % 60;
        const pad = (n) => n.toString().padStart(2, '0');
        if (hrs > 0) return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
        return `${pad(mins)}:${pad(secs)}`;
    };
}

if (typeof parseTimeString !== 'function') {
    window.parseTimeString = function(timeStr) {
        if (!timeStr) return 0;
        const str = timeStr.toString().trim();
        if (!isNaN(str)) return Math.max(0, parseFloat(str));
        const parts = str.split(':');
        try {
            if (parts.length === 3) return Math.max(0, (parseFloat(parts[0])||0)*3600 + (parseFloat(parts[1])||0)*60 + (parseFloat(parts[2])||0));
            if (parts.length === 2) return Math.max(0, (parseFloat(parts[0])||0)*60 + (parseFloat(parts[1])||0));
            if (parts.length === 1) return Math.max(0, parseFloat(parts[0])||0);
        } catch(e) { return 0; }
        return 0;
    };
}

if (typeof formatViews !== 'function') {
    window.formatViews = function(views) {
        if (!views) return "0 views";
        return new Intl.NumberFormat().format(views) + " views";
    };
}

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

    // Single-Task Engine
    let currentActiveTaskId = null;
    let currentPollTimer = null;
    let downloadTriggered = false;
    let isDraggingStart = false;
    let isDraggingEnd = false;

    // DOM Elements - Input Form
    const urlForm = document.getElementById('urlForm');
    const videoUrlInput = document.getElementById('videoUrl');
    const clearUrlBtn = document.getElementById('clearUrlBtn');
    const pasteBtn = document.getElementById('pasteBtn');
    const fetchBtn = document.getElementById('fetchBtn');
    const fetchBtnText = document.getElementById('fetchBtnText');
    const fetchSpinner = document.getElementById('fetchSpinner');
    const errorAlert = document.getElementById('errorAlert');
    const errorMessage = document.getElementById('errorMessage');
    const closeError = document.getElementById('closeError');

    // DOM Elements - Details & Utilities
    const detailsCard = document.getElementById('detailsCard');
    const videoThumb = document.getElementById('videoThumb');
    const videoDuration = document.getElementById('videoDuration');
    const togglePreviewBtn = document.getElementById('togglePreviewBtn');
    const playerPreviewBox = document.getElementById('playerPreviewBox');
    const previewIframe = document.getElementById('previewIframe');
    const closePreviewBtn = document.getElementById('closePreviewBtn');

    const videoTitle = document.getElementById('videoTitle');
    const videoChannel = document.getElementById('videoChannel');
    const videoViews = document.getElementById('videoViews');
    const downloadThumbBtn = document.getElementById('downloadThumbBtn');
    const copyUrlBtn = document.getElementById('copyUrlBtn');
    const copyUrlText = document.getElementById('copyUrlText');
    const openYtLink = document.getElementById('openYtLink');

    // Mode Tabs & Panes
    const tabVideo = document.getElementById('tabVideo');
    const tabAudio = document.getElementById('tabAudio');
    const videoPane = document.getElementById('videoPane');
    const audioPane = document.getElementById('audioPane');
    const videoFormatSelect = document.getElementById('videoFormatSelect');
    const resolutionsList = document.getElementById('resolutionsList');
    const audioList = document.getElementById('audioList');

    // Interactive Trimmer Elements
    const clipToggleBtn = document.getElementById('clipToggleBtn');
    const clipToggleThumb = document.getElementById('clipToggleThumb');
    const trimmerPanel = document.getElementById('trimmerPanel');
    const clipPreviewIframe = document.getElementById('clipPreviewIframe');
    const previewTimestampBadge = document.getElementById('previewTimestampBadge');
    const playClipBtn = document.getElementById('playClipBtn');
    const playClipText = document.getElementById('playClipText');
    const jumpStartBtn = document.getElementById('jumpStartBtn');
    const jumpEndBtn = document.getElementById('jumpEndBtn');
    const timelineVisualBar = document.getElementById('timelineVisualBar');
    const timelineRange = document.getElementById('timelineRange');
    const startRange = document.getElementById('startRange');
    const endRange = document.getElementById('endRange');
    const startSliderLabel = document.getElementById('startSliderLabel');
    const endSliderLabel = document.getElementById('endSliderLabel');
    const timelineTotal = document.getElementById('timelineTotal');
    const activeSelectionMetrics = document.getElementById('activeSelectionMetrics');
    const startTimeInput = document.getElementById('startTimeInput');
    const endTimeInput = document.getElementById('endTimeInput');

    // Summary & Download Button
    const downloadTargetSummary = document.getElementById('downloadTargetSummary');
    const startDownloadBtn = document.getElementById('startDownloadBtn');
    const btnDownloadText = document.getElementById('btnDownloadText');

    // Modal Elements (Fixed Overlay)
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

    // History Modal
    const historyBtn = document.getElementById('historyBtn');
    const historyBadge = document.getElementById('historyBadge');
    const historyModal = document.getElementById('historyModal');
    const historyList = document.getElementById('historyList');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const closeHistoryBtn = document.getElementById('closeHistoryBtn');

    // Initialize History Badge
    updateHistoryBadge();

    // URL Clear Button visibility
    videoUrlInput.addEventListener('input', () => {
        if (videoUrlInput.value.trim().length > 0) {
            clearUrlBtn.classList.remove('hidden');
        } else {
            clearUrlBtn.classList.add('hidden');
        }
    });

    clearUrlBtn.addEventListener('click', () => {
        videoUrlInput.value = '';
        clearUrlBtn.classList.add('hidden');
        videoUrlInput.focus();
    });

    // Clipboard Paste Helper
    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                videoUrlInput.value = text.trim();
                clearUrlBtn.classList.remove('hidden');
                triggerFetch();
            }
        } catch (e) {
            videoUrlInput.focus();
        }
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

    // Fetch Video Details
    async function triggerFetch() {
        const url = videoUrlInput.value.trim();
        if (!url) return;

        hideError();
        detailsCard.classList.add('hidden');
        playerPreviewBox.classList.add('hidden');
        previewIframe.src = '';
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

        openYtLink.href = data.url;

        totalDuration = data.duration || 100;
        startSeconds = 0;
        endSeconds = totalDuration;

        // Reset Trimmer State
        isClippingEnabled = false;
        updateClipToggleUI();

        // Setup Timeline labels & sliders
        timelineTotal.textContent = formatSeconds(totalDuration);
        startRange.min = 0;
        startRange.max = totalDuration;
        startRange.value = 0;
        endRange.min = 0;
        endRange.max = totalDuration;
        endRange.value = totalDuration;

        if (clipPreviewIframe && data.id) {
            clipPreviewIframe.src = `https://www.youtube-nocookie.com/embed/${data.id}?enablejsapi=1`;
        }

        renderResolutions();
        renderAudioOptions();
        setDownloadMode('video'); // default to video explicitly
        syncSliderPositions();
    }

    // HD Thumbnail Downloader Utility
    downloadThumbBtn.addEventListener('click', () => {
        if (!currentVideoData) return;
        const thumbDownloadUrl = `/api/thumbnail?url=${encodeURIComponent(currentVideoData.url)}&title=${encodeURIComponent(currentVideoData.title)}`;
        const a = document.createElement('a');
        a.href = thumbDownloadUrl;
        a.download = `${currentVideoData.title || 'video'}_Thumbnail.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });

    // Copy Video Link utility
    copyUrlBtn.addEventListener('click', async () => {
        if (!currentVideoData) return;
        try {
            await navigator.clipboard.writeText(currentVideoData.url);
            copyUrlText.textContent = "Copied!";
            setTimeout(() => { copyUrlText.textContent = "Copy Link"; }, 2000);
        } catch (e) {
            copyUrlText.textContent = "Failed";
            setTimeout(() => { copyUrlText.textContent = "Copy Link"; }, 2000);
        }
    });

    // In-App Preview Player
    togglePreviewBtn.addEventListener('click', () => {
        if (!currentVideoData || !currentVideoData.id) return;
        playerPreviewBox.classList.remove('hidden');
        const start = Math.floor(startSeconds);
        previewIframe.src = `https://www.youtube-nocookie.com/embed/${currentVideoData.id}?autoplay=1&start=${start}`;
        playerPreviewBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    closePreviewBtn.addEventListener('click', () => {
        playerPreviewBox.classList.add('hidden');
        previewIframe.src = '';
    });

    // ==========================================
    // UNAMBIGUOUS MODE SWITCHING & SELECTION
    // ==========================================

    function setDownloadMode(mode) {
        selectedMode = mode;

        if (mode === 'video') {
            tabVideo.className = "py-2.5 rounded-lg flex items-center justify-center gap-2 bg-rose-600 text-white shadow-md transition-all font-bold";
            tabAudio.className = "py-2.5 rounded-lg flex items-center justify-center gap-2 text-zinc-400 hover:text-zinc-200 transition-all font-bold";
            videoPane.classList.remove('hidden');
            audioPane.classList.add('hidden');
        } else {
            tabAudio.className = "py-2.5 rounded-lg flex items-center justify-center gap-2 bg-rose-600 text-white shadow-md transition-all font-bold";
            tabVideo.className = "py-2.5 rounded-lg flex items-center justify-center gap-2 text-zinc-400 hover:text-zinc-200 transition-all font-bold";
            audioPane.classList.remove('hidden');
            videoPane.classList.add('hidden');
        }

        updateDownloadSummary();
    }

    tabVideo.addEventListener('click', () => setDownloadMode('video'));
    tabAudio.addEventListener('click', () => setDownloadMode('audio'));
    videoFormatSelect.addEventListener('change', updateDownloadSummary);

    // Render Video Resolution Options
    function renderResolutions() {
        resolutionsList.innerHTML = '';
        if (currentVideoData.resolutions && currentVideoData.resolutions.length > 0) {
            currentVideoData.resolutions.forEach((res, index) => {
                const row = document.createElement('div');
                row.className = `option-row flex items-center justify-between p-3 bg-dark-950 border rounded-xl cursor-pointer transition-all ${index === 0 ? 'border-rose-500 bg-rose-500/10 shadow-sm' : 'border-white/[0.08] hover:border-zinc-700'}`;
                row.dataset.height = res.height;
                
                const activeDuration = isClippingEnabled ? Math.max(1, endSeconds - startSeconds) : totalDuration;
                const dynamicSize = formatBytes(Math.round(activeDuration * res.bytes_per_sec));

                row.innerHTML = `
                    <div class="flex items-center gap-2.5">
                        <div class="radio-circle w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${index === 0 ? 'border-rose-500 bg-rose-500' : 'border-zinc-600'}">
                            <span class="w-1 h-1 rounded-full bg-white ${index === 0 ? '' : 'hidden'}"></span>
                        </div>
                        <div>
                            <div class="font-bold text-xs sm:text-sm text-white flex items-center gap-1.5">
                                <span>${res.resolution}</span>
                                <span class="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-dark-800 text-rose-400 border border-rose-500/20">${res.quality_tag}</span>
                            </div>
                        </div>
                    </div>
                    <div class="res-size font-mono text-xs font-semibold text-zinc-400">
                        ${dynamicSize}
                    </div>
                `;

                row.addEventListener('click', () => {
                    document.querySelectorAll('#resolutionsList .option-row').forEach(r => {
                        r.classList.remove('border-rose-500', 'bg-rose-500/10', 'shadow-sm');
                        r.classList.add('border-white/[0.08]');
                        r.querySelector('.radio-circle').className = 'radio-circle w-3.5 h-3.5 rounded-full border-2 border-zinc-600 flex items-center justify-center';
                        r.querySelector('.radio-circle span').classList.add('hidden');
                    });

                    row.classList.remove('border-white/[0.08]');
                    row.classList.add('border-rose-500', 'bg-rose-500/10', 'shadow-sm');
                    row.querySelector('.radio-circle').className = 'radio-circle w-3.5 h-3.5 rounded-full border-2 border-rose-500 bg-rose-500 flex items-center justify-center';
                    row.querySelector('.radio-circle span').classList.remove('hidden');

                    selectedResolution = res;
                    setDownloadMode('video');
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
                card.className = `audio-row flex items-center justify-between p-3 bg-dark-950 border rounded-xl cursor-pointer transition-all ${index === 0 ? 'border-rose-500 bg-rose-500/10 shadow-sm' : 'border-white/[0.08] hover:border-zinc-700'}`;
                
                const activeDuration = isClippingEnabled ? Math.max(1, endSeconds - startSeconds) : totalDuration;
                const dynamicSize = formatBytes(Math.round(activeDuration * opt.bytes_per_sec));

                card.innerHTML = `
                    <div class="flex items-center gap-2.5">
                        <div class="radio-circle w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${index === 0 ? 'border-rose-500 bg-rose-500' : 'border-zinc-600'}">
                            <span class="w-1 h-1 rounded-full bg-white ${index === 0 ? '' : 'hidden'}"></span>
                        </div>
                        <div>
                            <div class="font-bold text-xs sm:text-sm text-white">${opt.label}</div>
                            <div class="text-[10px] text-zinc-500 font-mono">Format: .${opt.format.toUpperCase()} (${opt.bitrate})</div>
                        </div>
                    </div>
                    <div class="audio-size font-mono text-xs font-semibold text-zinc-400">
                        ${dynamicSize}
                    </div>
                `;

                card.addEventListener('click', () => {
                    document.querySelectorAll('#audioList .audio-row').forEach(c => {
                        c.classList.remove('border-rose-500', 'bg-rose-500/10', 'shadow-sm');
                        c.classList.add('border-white/[0.08]');
                        c.querySelector('.radio-circle').className = 'radio-circle w-3.5 h-3.5 rounded-full border-2 border-zinc-600 flex items-center justify-center';
                        c.querySelector('.radio-circle span').classList.add('hidden');
                    });

                    card.classList.remove('border-white/[0.08]');
                    card.classList.add('border-rose-500', 'bg-rose-500/10', 'shadow-sm');
                    card.querySelector('.radio-circle').className = 'radio-circle w-3.5 h-3.5 rounded-full border-2 border-rose-500 bg-rose-500 flex items-center justify-center';
                    card.querySelector('.radio-circle span').classList.remove('hidden');

                    selectedAudio = opt;
                    setDownloadMode('audio');
                });

                audioList.appendChild(card);
            });
            selectedAudio = currentVideoData.audio_options[0];
        }
    }

    // Dynamic Size Updates
    function updateOptionSizes() {
        if (!currentVideoData) return;
        const activeDuration = isClippingEnabled ? Math.max(1, endSeconds - startSeconds) : totalDuration;

        // Video options
        const resRows = document.querySelectorAll('#resolutionsList .option-row');
        currentVideoData.resolutions.forEach((res, i) => {
            if (resRows[i]) {
                const sizeEl = resRows[i].querySelector('.res-size');
                if (sizeEl) sizeEl.textContent = formatBytes(Math.round(activeDuration * res.bytes_per_sec));
            }
        });

        // Audio options
        const audioRows = document.querySelectorAll('#audioList .audio-row');
        currentVideoData.audio_options.forEach((opt, i) => {
            if (audioRows[i]) {
                const sizeEl = audioRows[i].querySelector('.audio-size');
                if (sizeEl) sizeEl.textContent = formatBytes(Math.round(activeDuration * opt.bytes_per_sec));
            }
        });
    }

    // Toggle Clipping Button
    clipToggleBtn.addEventListener('click', () => {
        isClippingEnabled = !isClippingEnabled;
        updateClipToggleUI();
        syncSliderPositions();
        updateDownloadSummary();
        updateOptionSizes();
        if (isClippingEnabled) {
            seekPreviewPlayer(startSeconds);
        }
    });

    function updateClipToggleUI() {
        if (isClippingEnabled) {
            clipToggleBtn.classList.remove('bg-dark-800');
            clipToggleBtn.classList.add('bg-rose-600', 'border-rose-500');
            clipToggleThumb.classList.remove('left-1', 'bg-zinc-400');
            clipToggleThumb.classList.add('right-1', 'bg-white');
            trimmerPanel.classList.remove('hidden');
        } else {
            clipToggleBtn.classList.remove('bg-rose-600', 'border-rose-500');
            clipToggleBtn.classList.add('bg-dark-800');
            clipToggleThumb.classList.remove('right-1', 'bg-white');
            clipToggleThumb.classList.add('left-1', 'bg-zinc-400');
            trimmerPanel.classList.add('hidden');
            pausePreviewPlayer();
        }
    }

    // ==========================================
    // REAL-TIME VIDEO PREVIEW & DUAL RANGE ENGINE
    // ==========================================

    function seekPreviewPlayer(sec) {
        if (clipPreviewIframe && clipPreviewIframe.contentWindow) {
            clipPreviewIframe.contentWindow.postMessage(
                JSON.stringify({
                    event: 'command',
                    func: 'seekTo',
                    args: [Math.floor(sec), true]
                }),
                '*'
            );
        }
    }

    let clipPlayTimer = null;
    let isPlayingClip = false;

    function playSelectedClip() {
        if (!currentVideoData || !clipPreviewIframe || !clipPreviewIframe.contentWindow) return;

        if (isPlayingClip) {
            pausePreviewPlayer();
            return;
        }

        isPlayingClip = true;
        playClipText.textContent = "Pause Clip";
        playClipBtn.classList.remove('bg-rose-600', 'hover:bg-rose-500');
        playClipBtn.classList.add('bg-amber-600', 'hover:bg-amber-500');

        seekPreviewPlayer(startSeconds);
        clipPreviewIframe.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'playVideo', args: '' }),
            '*'
        );

        if (clipPlayTimer) clearTimeout(clipPlayTimer);
        const clipLength = Math.max(1, endSeconds - startSeconds);

        clipPlayTimer = setTimeout(() => {
            pausePreviewPlayer();
            seekPreviewPlayer(startSeconds);
        }, (clipLength + 0.3) * 1000);
    }

    function pausePreviewPlayer() {
        isPlayingClip = false;
        playClipText.textContent = "Play Selected Clip";
        playClipBtn.classList.remove('bg-amber-600', 'hover:bg-amber-500');
        playClipBtn.classList.add('bg-rose-600', 'hover:bg-rose-500');
        if (clipPlayTimer) {
            clearTimeout(clipPlayTimer);
            clipPlayTimer = null;
        }
        if (clipPreviewIframe && clipPreviewIframe.contentWindow) {
            clipPreviewIframe.contentWindow.postMessage(
                JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' }),
                '*'
            );
        }
    }

    playClipBtn.addEventListener('click', playSelectedClip);

    jumpStartBtn.addEventListener('click', () => {
        pausePreviewPlayer();
        seekPreviewPlayer(startSeconds);
        previewTimestampBadge.textContent = `Frame: ${formatSeconds(startSeconds)}`;
    });

    jumpEndBtn.addEventListener('click', () => {
        pausePreviewPlayer();
        seekPreviewPlayer(endSeconds);
        previewTimestampBadge.textContent = `Frame: ${formatSeconds(endSeconds)}`;
    });

    // Dual Range Slider Controls
    startRange.addEventListener('input', () => {
        const val = parseFloat(startRange.value);
        if (val >= endSeconds) {
            startSeconds = Math.max(0, endSeconds - 1);
            startRange.value = startSeconds;
        } else {
            startSeconds = val;
        }
        syncSliderPositions();
        updateOptionSizes();
        updateDownloadSummary();
        seekPreviewPlayer(startSeconds);
        previewTimestampBadge.textContent = `Frame: ${formatSeconds(startSeconds)}`;
    });

    endRange.addEventListener('input', () => {
        const val = parseFloat(endRange.value);
        if (val <= startSeconds) {
            endSeconds = Math.min(totalDuration, startSeconds + 1);
            endRange.value = endSeconds;
        } else {
            endSeconds = val;
        }
        syncSliderPositions();
        updateOptionSizes();
        updateDownloadSummary();
        seekPreviewPlayer(endSeconds);
        previewTimestampBadge.textContent = `Frame: ${formatSeconds(endSeconds)}`;
    });

    function syncSliderPositions() {
        if (totalDuration <= 0) return;

        const startPct = (startSeconds / totalDuration) * 100;
        const endPct = (endSeconds / totalDuration) * 100;

        timelineRange.style.left = `${startPct}%`;
        timelineRange.style.width = `${Math.max(1, endPct - startPct)}%`;

        startSliderLabel.textContent = formatSeconds(startSeconds);
        endSliderLabel.textContent = formatSeconds(endSeconds);

        startRange.value = startSeconds;
        endRange.value = endSeconds;

        startTimeInput.value = formatSeconds(startSeconds);
        endTimeInput.value = formatSeconds(endSeconds);

        const clipSecs = Math.max(1, endSeconds - startSeconds);
        activeSelectionMetrics.textContent = `${formatSeconds(startSeconds)} ➔ ${formatSeconds(endSeconds)} (${clipSecs}s)`;
    }

    // Steppers for Start and End points
    document.querySelectorAll('.step-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            const delta = parseFloat(btn.dataset.delta) || 0;

            if (type === 'start') {
                startSeconds = Math.max(0, Math.min(totalDuration, startSeconds + delta));
                if (startSeconds >= endSeconds) {
                    startSeconds = Math.max(0, endSeconds - 1);
                }
                seekPreviewPlayer(startSeconds);
                previewTimestampBadge.textContent = `Frame: ${formatSeconds(startSeconds)}`;
            } else if (type === 'end') {
                endSeconds = Math.max(0, Math.min(totalDuration, endSeconds + delta));
                if (endSeconds <= startSeconds) {
                    endSeconds = Math.min(totalDuration, startSeconds + 1);
                }
                seekPreviewPlayer(endSeconds);
                previewTimestampBadge.textContent = `Frame: ${formatSeconds(endSeconds)}`;
            }

            syncSliderPositions();
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
        syncSliderPositions();
        updateDownloadSummary();
        updateOptionSizes();
        seekPreviewPlayer(startSeconds);
        previewTimestampBadge.textContent = `Frame: ${formatSeconds(startSeconds)}`;
    });

    endTimeInput.addEventListener('change', () => {
        const val = parseTimeString(endTimeInput.value);
        endSeconds = Math.max(0, Math.min(totalDuration, val));
        if (endSeconds <= startSeconds) {
            endSeconds = Math.min(totalDuration, startSeconds + 1);
        }
        syncSliderPositions();
        updateDownloadSummary();
        updateOptionSizes();
        seekPreviewPlayer(endSeconds);
        previewTimestampBadge.textContent = `Frame: ${formatSeconds(endSeconds)}`;
    });

    function updateDownloadSummary() {
        if (!currentVideoData) return;

        let summary = "";
        let btnText = "";
        const activeDuration = isClippingEnabled ? Math.max(1, endSeconds - startSeconds) : totalDuration;

        if (selectedMode === 'video') {
            const res = selectedResolution ? selectedResolution.resolution : '1080p';
            const fmt = videoFormatSelect.value.toUpperCase();
            const est = selectedResolution ? formatBytes(Math.round(activeDuration * selectedResolution.bytes_per_sec)) : '';
            summary = `Video: ${res} (${fmt}) • ~${est}`;
            btnText = isClippingEnabled ? `Download ${formatSeconds(activeDuration)} Video Clip (${res})` : `Download Video (${res} ${fmt})`;
        } else {
            const fmt = selectedAudio ? selectedAudio.format.toUpperCase() : 'MP3';
            const bit = selectedAudio ? selectedAudio.bitrate : '320k';
            const est = selectedAudio ? formatBytes(Math.round(activeDuration * selectedAudio.bytes_per_sec)) : '';
            summary = `Audio: ${fmt} (${bit}) • ~${est}`;
            btnText = isClippingEnabled ? `Download ${formatSeconds(activeDuration)} Audio Clip (${fmt})` : `Download Audio (${fmt} ${bit})`;
        }

        if (isClippingEnabled) {
            summary += ` [Clip: ${formatSeconds(startSeconds)} → ${formatSeconds(endSeconds)}]`;
        }

        downloadTargetSummary.textContent = summary;
        btnDownloadText.textContent = btnText;
    }

    // ==========================================
    // BULLETPROOF SINGLE-TASK DOWNLOAD CONTROLLER
    // ==========================================

    function resetDownloadButton() {
        startDownloadBtn.disabled = false;
        updateDownloadSummary();
    }

    function openProgressModal() {
        modalTitle.textContent = selectedMode === 'video' ? "Downloading Video" : "Downloading Audio";
        modalStage.textContent = "Connecting to stream server...";
        modalProgressFill.style.width = "0%";
        statPct.textContent = "0%";
        statSpeed.textContent = "--";
        statEta.textContent = "--";
        modalReadyBox.classList.add('hidden');
        modalErrorBox.classList.add('hidden');
        progressModal.classList.remove('hidden');
    }

    function closeProgressModal() {
        progressModal.classList.add('hidden');
        if (currentPollTimer) {
            clearInterval(currentPollTimer);
            currentPollTimer = null;
        }
        currentActiveTaskId = null;
        resetDownloadButton();
    }

    startDownloadBtn.addEventListener('click', async () => {
        if (!currentVideoData) return;

        // Prevent double triggers
        if (currentPollTimer) {
            clearInterval(currentPollTimer);
            currentPollTimer = null;
        }

        startDownloadBtn.disabled = true;
        btnDownloadText.textContent = "Initiating...";
        downloadTriggered = false;

        openProgressModal();

        const payload = {
            url: currentVideoData.url,
            type: selectedMode, // Strictly 'video' or 'audio'
            height: selectedMode === 'video' ? selectedResolution?.height : null,
            format: selectedMode === 'video' ? videoFormatSelect.value : (selectedAudio ? selectedAudio.format : 'mp3'),
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

            currentActiveTaskId = data.task_id;
            startSingleTaskPolling(currentActiveTaskId);
        } catch (err) {
            resetDownloadButton();
            showModalError(err.message);
        }
    });

    function startSingleTaskPolling(taskId) {
        if (currentPollTimer) {
            clearInterval(currentPollTimer);
            currentPollTimer = null;
        }

        currentPollTimer = setInterval(async () => {
            // Guard: only poll if this is still the active task
            if (!currentActiveTaskId || currentActiveTaskId !== taskId) {
                clearInterval(currentPollTimer);
                currentPollTimer = null;
                return;
            }

            try {
                const res = await fetch(`/api/task/${taskId}`);
                if (!res.ok) return;
                const task = await res.json();
                
                // Guard: discard responses from any old task
                if (task.id !== currentActiveTaskId) return;

                handleProgressUpdate(task);
            } catch (e) {
                // Ignore transient network errors
            }
        }, 400);
    }

    function handleProgressUpdate(task) {
        if (!task || task.id !== currentActiveTaskId) return;

        const status = task.status;
        const progress = Math.min(100, Math.max(0, task.progress || 0));

        modalProgressFill.style.width = `${progress}%`;
        statPct.textContent = `${Math.floor(progress)}%`;
        statSpeed.textContent = task.speed || '--';
        statEta.textContent = task.eta || '--';
        modalStage.textContent = task.stage || 'Processing media...';

        if (status === 'completed') {
            if (currentPollTimer) {
                clearInterval(currentPollTimer);
                currentPollTimer = null;
            }
            resetDownloadButton();
            showModalSuccess(task);
        } else if (status === 'failed') {
            if (currentPollTimer) {
                clearInterval(currentPollTimer);
                currentPollTimer = null;
            }
            resetDownloadButton();
            showModalError(task.error || 'Processing failed.');
        }
    }

    function showModalSuccess(task) {
        if (downloadTriggered) return;
        downloadTriggered = true;

        modalTitle.textContent = "Download Ready";
        modalStage.textContent = "Media converted successfully.";
        readyFileName.textContent = task.filename || "media_file";
        modalProgressFill.style.width = "100%";
        statPct.textContent = "100%";

        const fileUrl = `/api/file/${task.id}`;
        btnSaveDirect.href = fileUrl;
        btnSaveDirect.setAttribute('download', task.filename || 'download');

        modalReadyBox.classList.remove('hidden');

        // Automatically trigger browser download on user's device ONCE
        const a = document.createElement('a');
        a.href = fileUrl;
        a.download = task.filename || 'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Save to Local History ONCE
        addToHistory({
            id: task.id,
            filename: task.filename,
            size: task.file_size,
            date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            fileUrl: fileUrl
        });
    }

    function showModalError(errMsg) {
        modalTitle.textContent = "Download Issue";
        modalErrorMsg.textContent = errMsg;
        modalErrorBox.classList.remove('hidden');
    }

    modalDismissBtn.addEventListener('click', closeProgressModal);
    closeModalCross.addEventListener('click', closeProgressModal);
    modalRetryBtn.addEventListener('click', closeProgressModal);

    // ==========================================
    // DOWNLOADS HISTORY MANAGER
    // ==========================================

    function getHistory() {
        try {
            return JSON.parse(localStorage.getItem('tubeharvest_history') || '[]');
        } catch(e) {
            return [];
        }
    }

    function saveHistory(list) {
        try {
            localStorage.setItem('tubeharvest_history', JSON.stringify(list));
            updateHistoryBadge();
        } catch(e){}
    }

    function addToHistory(item) {
        const list = getHistory();
        list.unshift(item);
        if (list.length > 20) list.pop();
        saveHistory(list);
    }

    function updateHistoryBadge() {
        const list = getHistory();
        if (list.length > 0) {
            historyBadge.textContent = list.length;
            historyBadge.classList.remove('hidden');
        } else {
            historyBadge.classList.add('hidden');
        }
    }

    function renderHistoryModal() {
        const list = getHistory();
        historyList.innerHTML = '';
        if (list.length === 0) {
            historyList.innerHTML = '<div class="text-center py-8 text-xs text-zinc-500">No downloads saved in this session.</div>';
            return;
        }

        list.forEach((item) => {
            const card = document.createElement('div');
            card.className = "flex items-center justify-between p-3 bg-dark-950 border border-white/[0.08] rounded-xl text-xs";
            card.innerHTML = `
                <div class="min-w-0 pr-3">
                    <div class="font-bold text-white truncate max-w-xs">${item.filename}</div>
                    <div class="text-[10px] text-zinc-500 mt-0.5">${item.date} • ${item.size || 'Saved'}</div>
                </div>
                <a href="${item.fileUrl}" download="${item.filename}" class="px-2.5 py-1 bg-dark-800 hover:bg-rose-600 text-zinc-200 hover:text-white rounded-lg transition-colors font-semibold flex items-center gap-1 flex-shrink-0">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    <span>Save</span>
                </a>
            `;
            historyList.appendChild(card);
        });
    }

    historyBtn.addEventListener('click', () => {
        renderHistoryModal();
        historyModal.classList.remove('hidden');
    });

    closeHistoryBtn.addEventListener('click', () => historyModal.classList.add('hidden'));
    clearHistoryBtn.addEventListener('click', () => {
        saveHistory([]);
        renderHistoryModal();
    });
});
