import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { createAudio, type AudioBus } from "./audio";
import { threatHot, begin, createSim, debugSpawn, debugStartWave, formatTime, GUN_NAMES, spawnPickup, step, type Phase, type Result, type Sim } from "./sim";
import { botKeys } from "./bot";
import { nextPiece, poseAt, queryTrack } from "./road";
import { CARS, createWorld, type CarId } from "./world";

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setKeys: (codes: string[]) => void;
    };
  }
}

const SAVE_KEY = "nightfall-roadster-v2";

type Save = { bestScore: number; bestWave: number; bestTime: number };

function loadSave(): Save {
  const empty = { bestScore: 0, bestWave: 0, bestTime: 0 };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return empty;
    const p = JSON.parse(raw) as Partial<Save>;
    return {
      bestScore: typeof p.bestScore === "number" ? p.bestScore : 0,
      bestWave: typeof p.bestWave === "number" ? p.bestWave : 0,
      bestTime: typeof p.bestTime === "number" ? p.bestTime : 0,
    };
  } catch {
    return empty;
  }
}

function bestLine(save: Save) {
  if (save.bestScore <= 0) return "No record yet — the highway is open.";
  return `Best ${save.bestScore} pts · wave ${save.bestWave} · survived ${formatTime(save.bestTime)}`;
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
  const livesRef = useRef<HTMLElement>(null);
  const gunLabelRef = useRef<HTMLSpanElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const threatsRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<ReturnType<typeof createWorld> | null>(null);
  const [carIdx, setCarIdx] = useState(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("nf-car") : null;
    const i = CARS.findIndex((c) => c.id === saved);
    return i >= 0 ? i : 0;
  });
  const carIdxRef = useRef(carIdx);
  function pickCar(delta: number) {
    const i = (carIdxRef.current + delta + CARS.length) % CARS.length;
    carIdxRef.current = i;
    setCarIdx(i);
    try {
      localStorage.setItem("nf-car", CARS[i].id);
    } catch {
      /* private mode */
    }
    worldRef.current?.setCar(CARS[i].id as CarId);
  }
  const chipKey = useRef("");
  const knobRef = useRef<HTMLSpanElement>(null);
  const joy = useRef({ active: false, cx: 0, cy: 0 });

  const [phase, setPhase] = useState<Phase>("menu");
  const [result, setResult] = useState<Result | null>(null);
  const [best, setBest] = useState("Highway record loads with the night.");
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
      worldRef.current = world;
      world.setCar(CARS[carIdxRef.current].id as CarId);
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
    if (new URLSearchParams(window.location.search).has("debug")) {
      const w = window as unknown as { __nf?: Sim; __nfAdvance?: (secs: number, mode: "hunt" | "idle" | "cruise" | string[]) => void };
      w.__nf = sim;
      Object.assign(w, {
        __nfStage: {
          debugSpawn,
          debugStartWave,
          spawnPickup,
          // true when the next set piece (ramp/void) is far enough ahead and none is underway
          flat: (len: number) => {
            const h = sim.cars[0];
            const p = nextPiece(sim.track, h.along - 40);
            return !p || p.s - h.along > len;
          },
          lat: () => {
            const h = sim.cars[0];
            return queryTrack(sim.track, h.x, h.z, h.along).lateral;
          },
          alt: (id: number) => sim.cars[id].y - poseAt(sim.track, sim.cars[id].along).y,
        },
      });
      // Fast-forward the real sim with an autopilot (test harness only).
      w.__nfAdvance = (secs, mode) => {
        for (let i = 0; i < secs * 60 && sim.phase === "playing"; i++) {
          sim.keysOverride = new Set(
            mode === "hunt"
              ? botKeys(sim)
              : mode === "idle"
                ? []
                : mode === "cruise"
                  ? botKeys(sim, true).filter((k) => k === "KeyW" || k === "KeyA" || k === "KeyD" || k === "Space")
                  : (mode as unknown as string[]),
          );
          sim.events.length = 0;
          step(sim, 1 / 60);
        }
      };
      Object.assign(w, {
        __nfFade: () => world.debugFade(),
        __nfProject: (id: number) => world.project(sim, id),
        __nfCar: () => world.carInfo(),
        __nfRollout: () => world.rolloutState(),
        __nfSkipRollout: () => world.skipRollout(),
        __nfDraws: () => world.drawInfo(),
        __nfEnemies: () => world.enemyInfo(),
        __nfBehind: (off: number) => {
          const h = sim.cars[0];
          const lat = queryTrack(sim.track, h.x, h.z, h.along).lateral;
          const c = debugSpawn(sim, "rammer", off, lat);
          if (!c) return -1;
          c.ramCd = 99;
          c.hold = off;
          return c.id;
        },
      });
    }
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
      if (world?.rolloutState().active) {
        world.skipRollout(); // any key skips the rig rollout
        return;
      }
      if (sim.phase === "menu" && !e.repeat && (e.code === "ArrowLeft" || e.code === "ArrowRight")) pickCar(e.code === "ArrowLeft" ? -1 : 1);
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
      if (world?.rolloutState().active) {
        world.skipRollout(); // tap skips the rig rollout
        return;
      }
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
      const rolling = world.rolloutState().active;
      if (rolling) acc = 0;
      while (!rolling && acc >= stepDt && guard < 5) {
        step(sim, stepDt);
        acc -= stepDt;
        guard += 1;
      }
      world.sync(sim, dt, sim.phase === "menu");
      const hero = sim.cars[0];
      const live = sim.phase === "playing" || sim.phase === "paused";
      const rs = world.rolloutState();
      if (rs.active) audio.engine(0, rs.thrust, true);
      else audio.engine(hero.speed, hero.thrust, sim.phase === "playing" && hero.alive);
      for (const e of sim.events) {
        if (e.t === "shot") audio.gun();
        else if (e.t === "mine") audio.mine();
        else if (e.t === "boom") audio.boom();
        else if (e.t === "hit") audio.hit();
        else if (e.t === "land") audio.land(e.hard);
        else if (e.t === "fall") audio.fall();
        else if (e.t === "wave" || e.t === "pickup") audio.lap();
        else if (e.t === "rocket") audio.gun();
        else if (e.t === "life") audio.fall();
        else if (e.t === "over") audio.finish();
      }
      if (sim.phase !== phaseRef.current) {
        phaseRef.current = sim.phase;
        setPhase(sim.phase);
        if (sim.phase === "finished" && sim.result) {
          setResult(sim.result);
          const prev = loadSave();
          const next: Save = {
            bestScore: Math.max(prev.bestScore, sim.result.score),
            bestWave: Math.max(prev.bestWave, sim.result.wave),
            bestTime: Math.max(prev.bestTime, sim.result.time),
          };
          localStorage.setItem(SAVE_KEY, JSON.stringify(next));
          setBest(bestLine(next));
        }
      }
      if (live) paintHud(sim);
      paintThreats(sim, world, live && sim.phase === "playing");
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

  /** m3b: chevrons for enemies behind you or off-screen; pulse red while that enemy is firing or lining up a ram */
  function paintThreats(sim: Sim, world: { project: (sim: Sim, id: number) => { x: number; y: number; on: boolean; w: number; h: number } }, show: boolean) {
    const box = threatsRef.current;
    if (!box) return;
    const hero = sim.cars[0];
    let n = 0;
    if (show) {
      for (let i = 1; i < sim.cars.length; i++) {
        const c = sim.cars[i];
        if (!c.alive || c.leaving) continue;
        const behind = c.along < hero.along - 2;
        const p = world.project(sim, i);
        if (p.on && !behind) continue;
        if (Math.hypot(c.x - hero.x, c.z - hero.z) > 120) continue;
        let el = box.children[n] as HTMLDivElement | undefined;
        if (!el) {
          el = document.createElement("div");
          el.className = "nf-threat";
          el.innerHTML = "<span></span>";
          box.appendChild(el);
        }
        const cx = p.w / 2;
        const cy = p.h / 2;
        let x = p.x;
        let y = p.y;
        let ang: number;
        if (p.on) {
          // visible but behind you: mark it with a chevron just above it, pointing down at it
          y -= 26;
          ang = Math.PI;
          el.classList.add("is-near");
        } else {
          const dx = x - cx;
          const dy = y - cy;
          const m = 22;
          const s = Math.min((cx - m) / Math.max(1e-3, Math.abs(dx)), (cy - m) / Math.max(1e-3, Math.abs(dy)));
          x = cx + dx * Math.min(1, s);
          y = cy + dy * Math.min(1, s);
          ang = Math.atan2(dx, -dy);
          el.classList.remove("is-near");
        }
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${ang.toFixed(3)}rad)`;
        el.classList.toggle("is-hot", threatHot(sim, c));
        el.dataset.id = String(i);
        el.dataset.on = p.on ? "1" : "0";
        el.style.display = "";
        n += 1;
      }
    }
    for (let k = n; k < box.children.length; k++) (box.children[k] as HTMLElement).style.display = "none";
  }

  function paintHud(sim: Sim) {
    const hero = sim.cars[0];
    if (speedRef.current) speedRef.current.textContent = String(Math.round(Math.abs(hero.speed) * 3.6));
    if (lapRef.current) lapRef.current.textContent = String(Math.max(1, sim.wave));
    if (posRef.current) posRef.current.textContent = `Kills ${sim.takedowns}`;
    if (livesRef.current) livesRef.current.textContent = `×${Math.max(0, sim.lives)}`;
    if (timeRef.current) timeRef.current.textContent = formatTime(sim.time);
    if (toastRef.current) toastRef.current.textContent = sim.toastT > 0 ? sim.toast : "";
    if (fuelRef.current) fuelRef.current.style.transform = `scaleX(${hero.fuel / hero.maxFuel})`;
    if (hullRef.current) hullRef.current.style.transform = `scaleX(${Math.max(0, hero.hp) / hero.maxHp})`;
    if (roundsRef.current) roundsRef.current.textContent = String(Math.floor(hero.rounds));
    if (minesRef.current) minesRef.current.textContent = String(Math.floor(hero.mines) + sim.up.reserve);
    if (gunLabelRef.current) gunLabelRef.current.textContent = sim.up.gun === 0 ? "Guns" : GUN_NAMES[sim.up.gun].replace(" MG", "").replace(" gun", "");
    const u = sim.up;
    const chips: [string, string][] = [];
    if (u.rockets > 0) chips.push([`Rockets ${u.rockets}`, "#ff7a2a"]);
    if (u.armor > 0) chips.push([`Armor +${u.armor}`, "#b8c6d4"]);
    if (u.shieldT > 0) chips.push([`Shield ${Math.ceil(u.shieldT)}s`, "#4a8cff"]);
    if (u.oilT > 0) chips.push([`Oil ${Math.ceil(u.oilT)}s`, "#7a5cff"]);
    if (u.magnetT > 0) chips.push([`Magnet ${Math.ceil(u.magnetT)}s`, "#ff4ad0"]);
    if (u.cluster) chips.push(["Cluster mines", "#e23b2f"]);
    if (hero.maxFuel > 100) chips.push([`Nitro +${hero.maxFuel - 100}`, "#38d6ff"]);
    const key = chips.map((c) => c[0]).join("|");
    if (chipsRef.current && key !== chipKey.current) {
      chipKey.current = key;
      chipsRef.current.innerHTML = "";
      for (const [label, color] of chips) {
        const el = document.createElement("span");
        el.className = "nf-chip";
        el.style.setProperty("--chip", color);
        el.textContent = label;
        chipsRef.current.appendChild(el);
      }
    }
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
    worldRef.current?.setCar(CARS[carIdxRef.current].id as CarId);
    worldRef.current?.startRollout(sim); // hauler rig rollout; the sim waits (skippable by tap/key)
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
      <canvas ref={canvasRef} className="nf-canvas" aria-label="Nightfall Roadster highway combat" />
      {showPlay && (
        <div className="nf-hud">
          <div className="nf-threats" ref={threatsRef} aria-hidden="true" />
          <button type="button" className="nf-icon-btn left" onClick={togglePause} aria-label={phase === "paused" ? "Resume" : "Pause"}>
            {phase === "paused" ? <Play size={18} /> : <Pause size={18} />}
          </button>
          <button type="button" className="nf-icon-btn right" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <div className="nf-top">
            <div className="nf-readout">
              <p className="nf-kicker">Wave</p>
              <p className="nf-stat" ref={lapRef}>1</p>
              <p className="nf-sub" ref={posRef}>Kills 0</p>
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
              <p><span ref={gunLabelRef}>Guns</span> <strong ref={roundsRef}>24</strong></p>
              <p>Mines <strong ref={minesRef}>4</strong></p>
            </div>
            <div className="nf-meter">
              <p>Hull <strong ref={livesRef}>×3</strong></p>
              <div className="nf-bar is-hot"><div ref={hullRef} /></div>
            </div>
            <div className="nf-chips" ref={chipsRef} />
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
            <p className="nf-kicker">Night run · Côte Noire highway</p>
            <h1 className="nf-title">Nightfall <em>Roadster</em></h1>
            <p className="nf-lede">
              Hunters in waves. Guns forward, mines behind, cold-gas thrusters over the void. Three lives. Survive.
            </p>
            <div className="nf-carpick" role="group" aria-label="Choose car">
              <button type="button" className="nf-carpick-arrow" aria-label="Previous car" onClick={() => pickCar(-1)}>‹</button>
              <span className="nf-carpick-name" data-car={CARS[carIdx].id}>{CARS[carIdx].name}</span>
              <button type="button" className="nf-carpick-arrow" aria-label="Next car" onClick={() => pickCar(1)}>›</button>
            </div>
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
            <p className="nf-kicker">Côte Noire · wave {result.wave}</p>
            <h2 className="nf-title-sm">Wrecked</h2>
            <div className="nf-rows">
              <div><span>Survived</span><strong>{formatTime(result.time)}</strong></div>
              <div><span>Wave reached</span><strong>{result.wave}</strong></div>
              <div><span>Kills</span><strong>{result.takedowns}</strong></div>
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
  const hero = sim.cars[0];
  const sc = 0.55; // px per metre: ~70 m behind, ~220 m ahead
  const cx = w / 2;
  const cy = h * 0.74;
  const fx = -Math.sin(hero.yaw);
  const fz = -Math.cos(hero.yaw);
  const rx = Math.cos(hero.yaw);
  const rz = -Math.sin(hero.yaw);
  const X = (x: number, z: number) => cx + ((x - hero.x) * rx + (z - hero.z) * rz) * sc;
  const Y = (x: number, z: number) => cy - ((x - hero.x) * fx + (z - hero.z) * fz) * sc;
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = "butt";
  const from = hero.along - 70;
  const to = hero.along + 230;
  for (const pass of [0, 1]) {
    ctx.lineWidth = pass === 0 ? sim.track.width * sc : 4;
    ctx.strokeStyle = pass === 0 ? "rgba(156,148,136,0.55)" : "#e23b2f";
    ctx.beginPath();
    let pen = false;
    for (let s = from; s <= to; s += 6) {
      const p = poseAt(sim.track, s);
      const draw = pass === 0 ? !p.gap : p.gap;
      if (!draw) {
        pen = false;
        continue;
      }
      if (!pen) ctx.moveTo(X(p.x, p.z), Y(p.x, p.z));
      else ctx.lineTo(X(p.x, p.z), Y(p.x, p.z));
      pen = true;
    }
    ctx.stroke();
  }
  for (let i = sim.cars.length - 1; i >= 0; i--) {
    const c = sim.cars[i];
    if (!c.alive) continue;
    ctx.fillStyle = c.hero ? "#c4161c" : c.kind === "gunner" ? "#c6a36a" : "#f4efe6";
    ctx.beginPath();
    ctx.arc(X(c.x, c.z), Y(c.x, c.z), c.hero ? 4.5 : 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
}
