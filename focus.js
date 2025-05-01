// ==UserScript==
// @name         提示音定时器（自定义间隔 + 保存设置 + 自定义声音）
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  自定义提示音间隔，自定义声音，自动保存设置，支持通知与静音等功能。
// @author       Knan
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  if (window.__soundTimerInjected) return;
  window.__soundTimerInjected = true;

  const defaultSettings = {
    A_MIN: 3,
    A_MAX: 5,
    B_INTERVAL: 90,
    B_PAUSE: 20,
    A_PAUSE: 10, // 新增：A 提示音播放后的暂停时间（默认10秒）
    A_URL: "https://actions.google.com/sounds/v1/alarms/beep_short.ogg",
    B_URL: "https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg",
  };

  let settings = { ...defaultSettings };

  function loadSettings() {
    try {
      const saved = localStorage.getItem("sound_timer_settings");
      if (saved) {
        Object.assign(settings, JSON.parse(saved));
        // 确保加载的设置中A_MAX不超过5分钟
        settings.A_MAX = Math.min(5, settings.A_MAX);
      }
    } catch (e) {
      console.warn("加载设置失败", e);
    }
  }

  function saveSettings() {
    localStorage.setItem("sound_timer_settings", JSON.stringify(settings));
  }

  loadSettings();

  let isRunning = false;
  let isMuted = false;
  let isPaused = false;
  let isNotifyEnabled = true;

  let aTimer = null,
    bTimer = null;
  let countdownInterval = null;
  let nextATime = null,
    nextBTime = null;

  const panel = document.createElement("div");
  panel.style.cssText = `
            position: fixed; bottom: 20px; right: 20px;
            background: white; border: 1px solid #ccc;
            padding: 10px; z-index: 999999;
            font-size: 14px; font-family: sans-serif;
            box-shadow: 0 0 10px rgba(0,0,0,0.2);
            max-width: 280px;
          `;
  panel.innerHTML = `
            <strong>提示音定时器</strong><br/>
            <button id="startBtn">开始</button>
            <button id="stopBtn">停止</button>
            <button id="pauseBtn">⏸ 暂停</button>
            <button id="muteBtn">🔈 静音</button>
            <button id="notifyBtn">🔔 通知</button>
            <hr/>
            <div>
              <b>A 音间隔设置：</b><br/>
              A 音间隔：最小 <input id="aMin" type="number" style="width: 40px;" /> ~
              最大 <input id="aMax" type="number" style="width: 40px;" /> 分钟<br/>
              播放后暂停：<input id="aPause" type="number" style="width: 50px;" /> 秒
            </div>
            <hr/>
            <div>
              <b>B 音间隔设置：</b><br/>
              B 音间隔 <input id="bInt" type="number" style="width: 50px;" /> 分钟<br/>
              播放后暂停 <input id="bPause" type="number" style="width: 50px;" /> 分钟
            </div>
            <hr/>
            <div>
              <b>声音链接（可选）：</b><br/>
              A 音 URL：<input id="aUrl" type="text" placeholder="mp3/ogg 链接" style="width: 100%;" /><br/>
              B 音 URL：<input id="bUrl" type="text" placeholder="mp3/ogg 链接" style="width: 100%;" />
            </div>
            <div style="margin-top: 10px;">
              下次 A 音：<span id="nextA">--</span><br/>
              下次 B 音：<span id="nextB">--</span>
            </div>
            <hr/>
            <div>
              <button id="aPreviewBtn">试听 A 音</button>
              <button id="bPreviewBtn">试听 B 音</button>
            </div>
          `;
  document.body.appendChild(panel);

  const nextADisplay = document.getElementById("nextA");
  const nextBDisplay = document.getElementById("nextB");
  const pauseBtn = document.getElementById("pauseBtn");
  const muteBtn = document.getElementById("muteBtn");
  const notifyBtn = document.getElementById("notifyBtn");
  const aPreviewBtn = document.getElementById("aPreviewBtn");
  const bPreviewBtn = document.getElementById("bPreviewBtn");

  const inputAmin = document.getElementById("aMin");
  const inputAmax = document.getElementById("aMax");
  const inputBint = document.getElementById("bInt");
  const inputBpause = document.getElementById("bPause");
  const inputAurl = document.getElementById("aUrl");
  const inputBurl = document.getElementById("bUrl");
  const inputAPause = document.getElementById("aPause");

  // 填入默认值
  inputAmin.value = settings.A_MIN;
  inputAmax.value = settings.A_MAX = Math.min(5, settings.A_MAX); // 确保初始值不超过5分钟
  inputBint.value = settings.B_INTERVAL;
  inputBpause.value = settings.B_PAUSE;
  inputAurl.value = settings.A_URL || "";
  inputBurl.value = settings.B_URL || "";
  inputAPause.value = settings.A_PAUSE;

  function updateSettingsFromInputs() {
    settings.A_MIN = Math.max(1, parseInt(inputAmin.value));
    settings.A_MAX = Math.max(settings.A_MIN, parseInt(inputAmax.value));
    // 确保A_MAX不超过5分钟，并更新输入框显示
    settings.A_MAX = Math.min(5, settings.A_MAX);
    inputAmax.value = settings.A_MAX;

    settings.B_INTERVAL = Math.max(1, parseInt(inputBint.value));
    settings.B_PAUSE = Math.max(0, parseInt(inputBpause.value));
    settings.A_PAUSE = Math.max(1, parseInt(inputAPause.value));
    settings.A_URL = inputAurl.value.trim() || defaultSettings.A_URL;
    settings.B_URL = inputBurl.value.trim() || defaultSettings.B_URL;
    saveSettings();
  }

  inputAmin.addEventListener("change", updateSettingsFromInputs);
  inputAmax.addEventListener("change", updateSettingsFromInputs);
  inputBint.addEventListener("change", updateSettingsFromInputs);
  inputBpause.addEventListener("change", updateSettingsFromInputs);
  inputAurl.addEventListener("input", updateSettingsFromInputs);
  inputBurl.addEventListener("input", updateSettingsFromInputs);
  inputAPause.addEventListener("change", updateSettingsFromInputs);

  function log(msg) {
    console.log(`[提示音定时器] ${msg}`);
  }

  function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}分${sec.toString().padStart(2, "0")}秒`;
  }

  function updateCountdownDisplay() {
    const now = Date.now();
    if (nextATime)
      nextADisplay.textContent = formatTime(Math.max(0, nextATime - now));
    if (nextBTime)
      nextBDisplay.textContent = formatTime(Math.max(0, nextBTime - now));
  }

  function startCountdownUpdater() {
    clearInterval(countdownInterval);
    countdownInterval = setInterval(updateCountdownDisplay, 1000);
  }

  function stopCountdownUpdater() {
    clearInterval(countdownInterval);
    nextADisplay.textContent = "--";
    nextBDisplay.textContent = "--";
  }

  function notify(title, body) {
    if (!isNotifyEnabled) return;
    if (Notification.permission === "granted") {
      new Notification(title, { body });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          new Notification(title, { body });
        }
      });
    }
  }

  function playSoundAndThen(url, label, onComplete) {
    if (isPaused) {
      log(`${label} 已暂停，延后播放`);
      setTimeout(() => playSoundAndThen(url, label, onComplete), 5000);
      return;
    }

    notify(label, `即将播放 ${label}`);
    if (isMuted) {
      log(`${label} 静音中，跳过播放`);
      setTimeout(onComplete, 100); // 跳过播放
      return;
    }

    const audio = new Audio(url);
    audio
      .play()
      .then(() => {
        log(`${label} 播放中...`);
        audio.onended = () => {
          log(`${label} 播放完成`);
          onComplete();
        };
      })
      .catch((err) => {
        log(`${label} 播放失败: ${err.message}`);
        onComplete();
      });
  }

  // 试听 A 音
  aPreviewBtn.addEventListener("click", () => {
    playSoundAndThen(settings.A_URL, "A 提示音", () => {});
  });

  // 试听 B 音
  bPreviewBtn.addEventListener("click", () => {
    playSoundAndThen(settings.B_URL, "B 提示音", () => {});
  });

  function scheduleRandomA() {
    if (!isRunning) return;
    updateSettingsFromInputs();

    // 确保A_MAX不超过5分钟
    settings.A_MAX = Math.min(5, settings.A_MAX);

    const delay =
      Math.floor(
        Math.random() * (settings.A_MAX - settings.A_MIN + 1) * 60 * 1000
      ) +
      settings.A_MIN * 60 * 1000;
    nextATime = Date.now() + delay;
    updateCountdownDisplay();
    log(`A 音将在 ${Math.round(delay / 1000)} 秒后播放`);
    aTimer = setTimeout(() => {
      playSoundAndThen(settings.A_URL, "A 提示音", () => {
        log(`A 音播放后暂停 ${settings.A_PAUSE} 秒...`);
        nextATime = Date.now() + settings.A_PAUSE * 1000;
        updateCountdownDisplay();
        setTimeout(scheduleRandomA, settings.A_PAUSE * 1000);
      });
    }, delay);
  }

  function scheduleLoopB() {
    if (!isRunning) return;
    updateSettingsFromInputs();

    const delay = settings.B_INTERVAL * 60 * 1000;
    nextBTime = Date.now() + delay;
    updateCountdownDisplay();
    log(`B 音将在 ${settings.B_INTERVAL} 分钟后播放`);
    bTimer = setTimeout(() => {
      playSoundAndThen(settings.B_URL, "B 提示音", () => {
        log(`B 音播放后暂停 ${settings.B_PAUSE} 分钟...`);
        nextBTime = Date.now() + settings.B_PAUSE * 60 * 1000;
        updateCountdownDisplay();
        setTimeout(scheduleLoopB, settings.B_PAUSE * 60 * 1000);
      });
    }, delay);
  }

  function start() {
    if (isRunning) return log("已经启动");
    isRunning = true;
    isPaused = false;
    pauseBtn.textContent = "⏸ 暂停";

    const unlock = new Audio(settings.A_URL);
    unlock
      .play()
      .then(() => {
        unlock.pause();
        unlock.currentTime = 0;
        log("已解锁音频播放权限，开始定时");
        Notification.requestPermission();
        startCountdownUpdater();
        scheduleRandomA();
        scheduleLoopB();
      })
      .catch((err) => {
        isRunning = false;
        alert("请先点击页面并允许播放音频，然后再点击开始按钮");
        log("音频权限未授予：" + err.message);
      });
  }

  function stop() {
    if (!isRunning) return log("已停止");
    isRunning = false;
    clearTimeout(aTimer);
    clearTimeout(bTimer);
    stopCountdownUpdater();
    log("已停止所有定时任务");
  }

  function toggleMute() {
    isMuted = !isMuted;
    muteBtn.textContent = isMuted ? "🔇 已静音" : "🔈 静音";
    log(isMuted ? "已静音" : "取消静音");
  }

  function togglePause() {
    isPaused = !isPaused;
    pauseBtn.textContent = isPaused ? "▶️ 恢复" : "⏸ 暂停";
    log(isPaused ? "已暂停播放" : "已恢复播放");

    if (isPaused) {
      // 暂停时，记录剩余时间并清除定时器
      if (nextATime) {
        window.__pausedATimeRemaining = Math.max(0, nextATime - Date.now());
        clearTimeout(aTimer);
      }
      if (nextBTime) {
        window.__pausedBTimeRemaining = Math.max(0, nextBTime - Date.now());
        clearTimeout(bTimer);
      }
      // 暂停倒计时更新
      clearInterval(countdownInterval);
    } else {
      // 恢复时，使用剩余时间重新设置定时器
      if (window.__pausedATimeRemaining) {
        nextATime = Date.now() + window.__pausedATimeRemaining;
        aTimer = setTimeout(() => {
          playSoundAndThen(settings.A_URL, "A 提示音", () => {
            log(`A 音播放后暂停 ${settings.A_PAUSE} 秒...`);
            nextATime = Date.now() + settings.A_PAUSE * 1000;
            updateCountdownDisplay();
            setTimeout(scheduleRandomA, settings.A_PAUSE * 1000);
          });
        }, window.__pausedATimeRemaining);
        window.__pausedATimeRemaining = null;
      }
      if (window.__pausedBTimeRemaining) {
        nextBTime = Date.now() + window.__pausedBTimeRemaining;
        bTimer = setTimeout(() => {
          playSoundAndThen(settings.B_URL, "B 提示音", () => {
            log(`B 音播放后暂停 ${settings.B_PAUSE} 分钟...`);
            nextBTime = Date.now() + settings.B_PAUSE * 60 * 1000;
            updateCountdownDisplay();
            setTimeout(scheduleLoopB, settings.B_PAUSE * 60 * 1000);
          });
        }, window.__pausedBTimeRemaining);
        window.__pausedBTimeRemaining = null;
      }
      // 恢复倒计时更新
      startCountdownUpdater();
    }
    // 立即更新一次显示
    updateCountdownDisplay();
  }

  function toggleNotify() {
    isNotifyEnabled = !isNotifyEnabled;
    notifyBtn.textContent = isNotifyEnabled ? "🔔 通知" : "🔕 静默";
    log(isNotifyEnabled ? "已开启通知" : "已关闭通知");
  }

  document.getElementById("startBtn").addEventListener("click", start);
  document.getElementById("stopBtn").addEventListener("click", stop);
  muteBtn.addEventListener("click", toggleMute);
  pauseBtn.addEventListener("click", togglePause);
  notifyBtn.addEventListener("click", toggleNotify);
})();
