import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { createAudio, type AudioBus } from "./audio";
import { begin, createSim, formatTime, rankOf, step, type Phase, type Result, type Sim } from "./sim";
import { createWorld } from "./world";

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setKeys: (codes: string[]) => void;
    };
  }
}

const SAVE_KEY = "nightfall-roadster-v1";

type Save = { bestTime: number | null; bestLap: number | null; bestScore: number };

function loadSave(): Save {
  const empty = { bestTime: null, bestLap: null, bestScore: 0 };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return empty;
    const p = JSON.parse(raw) as Partial<Save>;
    return {
      bestTime: typeof p.bestTime === "number" ? p.bestTime : null,
      bestLap: typeof p.bestLap === "number" ? p.bestLap : null,
      bestScore: typeof p.bestScore === "number" ? p.bestScore : 0,
    };
  } catch {
    return empty;
  }
}

function bestLine(save: Save) {
  if (save.bestTime == null) return "No record yet — the circuit is open.";
  return `Best ${formatTime(save.bestTime)} · lap ${save.bestLap == null ? "—" : formatTime(save.bestLap)} · ${save.bestScore} pts`;
}

function placeWord(n: number) {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

export function RoadsterGame() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Sim | null>(null);
  const audioRef = useRef<AudioBus | null>(null);
  const phaseRef = useRef<Phase>("menu");
  const speedRef = useRef<HTMLSpanElement>(null);
  const lapRef = useRef<HTMLParagraphElement>(null);
  const posRef = useRef<HTMLParagraphElement>(null);
  const timeRef = useRef<HTMLParagraphElement>(null);
  const toastRef = useRef<HTMLParagraphElement>(null);
  const fuelRef = useRef<HTMLDivElement>(null);
  const hullRef = useRef<HTMLDivElement>(null);
  const roundsRef = useRef<HTMLElement>(null);
  const minesRef = useRef<HTMLElement>(null);
  const knobRef = useRef<HTMLSpanElement>(null);
  const joy = useRef({ active: false, cx: 0, cy: 0 });

  const [phase, setPhase] = useState<Phase>("menu");
  const [result, setResult] = useState<Result | null>(null);
  const [best, setBest] = useState("Circuit record loads with the night.");
  const [muted, setMuted] = useState(false);
  const [cruise, setCruise] = useState(false);
  const [glError, setGlError] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const sim = createSim();
    let world: ReturnType<typeof createWorld>;
    try {
      world = createWorld(canvas);
    } catch (err) {
      console.warn("WebGL unavailable", err);
      setGlError(true);
      return;
    }
    const audio = createAudio();
    simRef.current = sim;
    audioRef.current = audio;
    setBest(bestLine(loadSave()));

    // Test hook only for harness runs (?debug); never exposed in normal play.
    if (new URLSearchParams(window.location.search).has("debug")) (window as unknown as { __nf?: Sim }).__nf = sim;
    window.__controlsTest = {
      getYaw: () => sim.cars[0].yaw,
      getSpeed: () => sim.cars[0].speed,
      setKeys: (codes: string[]) => {
        sim.keysOverride = new Set(codes);
      },
    };

    const unlock = () => audio.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
      sim.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === "KeyM") {
        const next = !audio.muted();
        audio.setMuted(next);
        setMuted(next);
      }
      if (e.code === "Escape") {
        if (sim.phase === "playing") sim.phase = "paused";
        else if (sim.phase === "paused") sim.phase = "playing";
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      sim.keys.delete(e.code);
    };
    const clearKeys = () => {
      sim.keys.clear();
      sim.mouseFire = false;
      sim.mouseMine = false;
    };
    const onVis = () => {
      if (document.hidden) clearKeys();
      else audio.resume();
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || sim.phase !== "playing") return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("button, a, .nf-touch, .nf-panel, .nf-card")) return;
      if (e.button === 0) sim.mouseFire = true;
      if (e.button === 2) {
        sim.mouseMine = true;
        e.preventDefault();
      }
    };
    const onUp = (e: PointerEvent) => {
      if (e.button === 0) sim.mouseFire = false;
      if (e.button === 2) sim.mouseMine = false;
    };
    const onContext = (e: Event) => e.preventDefault();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearKeys);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    wrap.addEventListener("contextmenu", onContext);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const stepDt = 1 / 60;

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      world.resize(r.width, r.height, window.devicePixelRatio || 1);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    window.addEventListener("orientationchange", resize);
    window.addEventListener("resize", resize);

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      acc = Math.min(stepDt * 5, acc + dt);
      sim.events.length = 0;
      let guard = 0;
      while (acc >= stepDt && guard < 5) {
        step(sim, stepDt);
        acc -= stepDt;
        guard += 1;
      }
      world.sync(sim, dt, sim.phase === "menu");
      const hero = sim.cars[0];
      const live = sim.phase === "playing" || sim.phase === "paused";
      audio.engine(hero.speed, hero.thrust, sim.phase === "playing" && hero.alive);
      for (const e of sim.events) {
        if (e.t === "shot") audio.gun();
        else if (e.t === "mine") audio.mine();
        else if (e.t === "boom") audio.boom();
        else if (e.t === "hit") audio.hit();
        else if (e.t === "land") audio.land(e.hard);
        else if (e.t === "fall") audio.fall();
        else if (e.t === "lap") audio.lap();
        else if (e.t === "finish") audio.finish();
      }
      if (sim.phase !== phaseRef.current) {
        phaseRef.current = sim.phase;
        setPhase(sim.phase);
        if (sim.phase === "finished" && sim.result) {
          setResult(sim.result);
          const prev = loadSave();
          const next: Save = {
            bestTime: prev.bestTime == null ? sim.result.time : Math.min(prev.bestTime, sim.result.time),
            bestLap:
              sim.result.bestLap == null
                ? prev.bestLap
                : prev.bestLap == null
                  ? sim.result.bestLap
                  : Math.min(prev.bestLap, sim.result.bestLap),
            bestScore: Math.max(prev.bestScore, sim.result.score),
          };
          localStorage.setItem(SAVE_KEY, JSON.stringify(next));
          setBest(bestLine(next));
        }
      }
      if (live) paintHud(sim);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("orientationchange", resize);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearKeys);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      wrap.removeEventListener("contextmenu", onContext);
      delete window.__controlsTest;
      world.dispose();
      simRef.current = null;
    };
  }, []);

  function paintHud(sim: Sim) {
    const hero = sim.cars[0];
    if (speedRef.current) speedRef.current.textContent = String(Math.round(Math.abs(hero.speed) * 3.6));
    if (lapRef.current) lapRef.current.textContent = `${Math.min(3, hero.lap + 1)} / 3`;
    if (posRef.current) posRef.current.textContent = placeWord(rankOf(sim, hero));
    if (timeRef.current) timeRef.current.textContent = formatTime(sim.time);
    if (toastRef.current) toastRef.current.textContent = sim.toastT > 0 ? sim.toast : "";
    if (fuelRef.current) fuelRef.current.style.transform = `scaleX(${hero.fuel / hero.maxFuel})`;
    if (hullRef.current) hullRef.current.style.transform = `scaleX(${Math.max(0, hero.hp) / hero.maxHp})`;
    if (roundsRef.current) roundsRef.current.textContent = String(Math.floor(hero.rounds));
    if (minesRef.current) minesRef.current.textContent = String(Math.floor(hero.mines));
    const map = mapRef.current;
    if (map) drawMap(map, sim);
  }

  function startRace() {
    const sim = simRef.current;
    const audio = audioRef.current;
    if (!sim || !audio) return;
    audio.unlock();
    const coarse = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 820;
    sim.autoGas = coarse;
    setCruise(coarse);
    begin(sim);
    phaseRef.current = "playing";
    setPhase("playing");
  }

  function togglePause() {
    const sim = simRef.current;
    if (!sim) return;
    if (sim.phase === "playing") sim.phase = "paused";
    else if (sim.phase === "paused") sim.phase = "playing";
  }

  function toggleMute() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.unlock();
    const next = !audio.muted();
    audio.setMuted(next);
    setMuted(next);
  }

  function hold(flag: "fire" | "mine" | "thrust", down: boolean) {
    const sim = simRef.current;
    if (!sim) return;
    sim.touch[flag] = down;
  }

  function onJoyDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    joy.current.active = true;
    joy.current.cx = r.left + r.width / 2;
    joy.current.cy = r.top + r.height / 2;
    onJoyMove(e);
  }

  function onJoyMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!joy.current.active) return;
    const sim = simRef.current;
    if (!sim) return;
    const dx = e.clientX - joy.current.cx;
    const dy = e.clientY - joy.current.cy;
    const nx = Math.max(-1, Math.min(1, dx / 52));
    const ny = Math.max(-1, Math.min(1, dy / 52));
    sim.touch.steer = -nx;
    sim.touch.throttle = Math.max(-1, Math.min(1, -ny));
    if (knobRef.current) knobRef.current.style.transform = `translate(${nx * 26}px, ${ny * 26}px)`;
  }

  function onJoyUp() {
    joy.current.active = false;
    const sim = simRef.current;
    if (sim) {
      sim.touch.steer = 0;
      sim.touch.throttle = 0;
    }
    if (knobRef.current) knobRef.current.style.transform = "translate(0px, 0px)";
  }

  const showPlay = phase === "playing" || phase === "paused";

  return (
    <div className="nf-root" ref={wrapRef}>
      <canvas ref={canvasRef} className="nf-canvas" aria-label="Nightfall Roadster race" />
      {showPlay && (
        <div className="nf-hud">
          <button type="button" className="nf-icon-btn left" onClick={togglePause} aria-label={phase === "paused" ? "Resume" : "Pause"}>
            {phase === "paused" ? <Play size={18} /> : <Pause size={18} />}
          </button>
          <button type="button" className="nf-icon-btn right" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <div className="nf-top">
            <div className="nf-readout">
              <p className="nf-kicker">Lap</p>
              <p className="nf-stat" ref={lapRef}>1 / 3</p>
              <p className="nf-sub" ref={posRef}>1st</p>
            </div>
            <div className="nf-map-wrap">
              <canvas ref={mapRef} className="nf-map" width={160} height={160} />
              <p className="nf-sub" ref={timeRef}>0:00.00</p>
            </div>
          </div>
          <div className="nf-center">
            <p className="nf-speed">
              <span ref={speedRef}>0</span>
              <span className="unit">km/h</span>
            </p>
            <p className="nf-toast" ref={toastRef} />
          </div>
          <div className="nf-cross" />
          <div className="nf-bottom">
            <div className="nf-meter">
              <p>Thrust <strong className="nf-keys">Space</strong></p>
              <div className="nf-bar is-fuel"><div ref={fuelRef} /></div>
            </div>
            <div className="nf-meter">
              <p>Guns <strong ref={roundsRef}>24</strong></p>
              <p>Mines <strong ref={minesRef}>4</strong></p>
            </div>
            <div className="nf-meter">
              <p>Hull</p>
              <div className="nf-bar is-hot"><div ref={hullRef} /></div>
            </div>
          </div>
          <div className={`nf-touch${phase === "playing" ? " is-live" : ""}`}>
            <div
              className="nf-stick"
              onPointerDown={onJoyDown}
              onPointerMove={onJoyMove}
              onPointerUp={onJoyUp}
              onPointerCancel={onJoyUp}
              role="slider"
              aria-label="Steer and throttle"
              aria-valuemin={-1}
              aria-valuemax={1}
              aria-valuenow={0}
            >
              <span className="nf-knob" ref={knobRef} />
            </div>
            <div className="nf-actions">
              <button type="button" className={cruise ? "is-on" : ""} onClick={() => {
                const sim = simRef.current;
                if (!sim) return;
                sim.autoGas = !sim.autoGas;
                setCruise(sim.autoGas);
              }}>
                Cruise
              </button>
              <button type="button" onPointerDown={(e) => { e.preventDefault(); hold("fire", true); }} onPointerUp={() => hold("fire", false)} onPointerLeave={() => hold("fire", false)}>
                Fire
              </button>
              <button type="button" onPointerDown={(e) => { e.preventDefault(); hold("mine", true); }} onPointerUp={() => hold("mine", false)} onPointerLeave={() => hold("mine", false)}>
                Mine
              </button>
              <button type="button" className="thrust" onPointerDown={(e) => { e.preventDefault(); hold("thrust", true); }} onPointerUp={() => hold("thrust", false)} onPointerLeave={() => hold("thrust", false)}>
                Thrust
              </button>
            </div>
          </div>
        </div>
      )}

      {glError && (
        <div className="nf-overlay" style={{ display: "grid", placeItems: "center", zIndex: 10 }}>
          <div className="nf-card">
            <h2>3D graphics unavailable</h2>
            <p>WebGL could not start on this device or browser. Try enabling hardware acceleration or another browser.</p>
          </div>
        </div>
      )}

      {phase === "menu" && !glError && (
        <div className="nf-menu">
          <div className="nf-panel">
            <p className="nf-kicker">Night run · Côte Noire</p>
            <h1 className="nf-title">Nightfall <em>Roadster</em></h1>
            <p className="nf-lede">
              Three laps. Guns forward, mines behind, cold-gas thrusters over the jumps and the void.
            </p>
            <div className="nf-launch">
              <button type="button" className="nf-btn" onClick={startRace}>
                Start
              </button>
              <p className="nf-best">{best}</p>
            </div>
            <p className="nf-keysline nf-keys">
              <kbd>W/S</kbd> "gas" 😉
              <kbd>A/D</kbd> steer
              <kbd>Space</kbd> thrust
              <kbd>F</kbd> guns
              <kbd>G</kbd> mines
              <kbd>Esc</kbd> pause
            </p>
            <p className="nf-credit" style={{ marginTop: "0.9rem", fontSize: "0.72rem", opacity: 0.6, letterSpacing: "0.04em" }}>
              Grok Code Reliant studio. An original game, not affiliated with any car brand.
            </p>
          </div>
        </div>
      )}

      {phase === "paused" && (
        <div className="nf-overlay">
          <div className="nf-card">
            <p className="nf-kicker">Hold position</p>
            <h2>Paused</h2>
            <button type="button" className="nf-btn" onClick={togglePause}>Resume</button>
          </div>
        </div>
      )}

      {phase === "finished" && result && (
        <div className="nf-overlay">
          <div className="nf-card">
            <p className="nf-kicker">Côte Noire · {placeWord(result.position)}</p>
            <h2 className="nf-title-sm">{result.position === 1 ? "Clean getaway" : "Pursuit closed"}</h2>
            <div className="nf-rows">
              <div><span>Time</span><strong>{formatTime(result.time)}</strong></div>
              <div><span>Best lap</span><strong>{result.bestLap == null ? "—" : formatTime(result.bestLap)}</strong></div>
              <div><span>Agents down</span><strong>{result.takedowns}</strong></div>
              <div><span>Falls</span><strong>{result.falls}</strong></div>
              <div><span>Score</span><strong>{result.score}</strong></div>
            </div>
            <button type="button" className="nf-btn" onClick={startRace}>Run it again</button>
            <p className="nf-best">{best}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function drawMap(canvas: HTMLCanvasElement, sim: Sim) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const samples = sim.track.samples;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const s of samples) {
    if (s.x < minX) minX = s.x;
    if (s.x > maxX) maxX = s.x;
    if (s.z < minZ) minZ = s.z;
    if (s.z > maxZ) maxZ = s.z;
  }
  const pad = 12;
  const sx = (w - pad * 2) / (maxX - minX || 1);
  const sy = (h - pad * 2) / (maxZ - minZ || 1);
  const sc = Math.min(sx, sy);
  const ox = (w - (maxX - minX) * sc) / 2;
  const oy = (h - (maxZ - minZ) * sc) / 2;
  const X = (x: number) => ox + (x - minX) * sc;
  const Y = (z: number) => oy + (z - minZ) * sc;
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#9c9488";
  ctx.beginPath();
  samples.forEach((s, i) => {
    const x = X(s.x);
    const y = Y(s.z);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.strokeStyle = "#e23b2f";
  ctx.lineWidth = 4;
  ctx.beginPath();
  let pen = false;
  for (const s of samples) {
    if (!s.gap) {
      pen = false;
      continue;
    }
    if (!pen) {
      ctx.moveTo(X(s.x), Y(s.z));
      pen = true;
    } else ctx.lineTo(X(s.x), Y(s.z));
  }
  ctx.stroke();
  for (let i = sim.cars.length - 1; i >= 0; i--) {
    const c = sim.cars[i];
    if (!c.alive) continue;
    ctx.fillStyle = c.hero ? "#c4161c" : "#f4efe6";
    ctx.beginPath();
    ctx.arc(X(c.x), Y(c.z), c.hero ? 4.5 : 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
