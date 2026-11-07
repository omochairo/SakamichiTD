/**
 * SakamichiTD - Main Game Controller (手描きスケッチ準拠 ジグザグ板スロープ版)
 */

// localStorage はプライベートモード・ファイル直開き・ストレージ無効の環境で例外を投げることがある。
// 保存できなくてもゲームは続けられるよう、読み書きの失敗は握りつぶす
const safeStorage = {
    get(key) {
        try {
            return window.localStorage.getItem(key);
        } catch (e) {
            return null;
        }
    },
    set(key, value) {
        try {
            window.localStorage.setItem(key, value);
        } catch (e) {}
    }
};

// 撃破 1 体あたりのスコア = 撃破時のマナ報酬 × この倍率
// （エリート合体・周回の補正が乗った manaReward を使うので、強い敵ほど高い）
const SCORE_PER_MANA_REWARD = 5;

class GameManager {
    constructor() {
        this.canvas = null;
        this.ctx = null;

        this.mana = 60;
        this.maxMana = GAME_CONFIG.MANA_MAX;
        this.manaRegen = GAME_CONFIG.MANA_REGEN_BASE;

        this.stage = 1;
        this.wave = 1;
        this.maxWave = 4;
        this.waveTimer = 0;
        this.enemySpawnTimer = 0;
        this.waveActive = false;
        this.isPaused = false;
        this.gameSpeed = 1.0;
        this.isGameOver = false;
        this.isVictory = false;

        this.infiniteMana = false;

        this.ballCooldowns = {
            pingpong: 0,
            iron: 0,
            spike: 0,
            super: 0,
            bomb: 0
        };

        this.relicState = {};
        this.lastTime = 0;

        // ボス＆Wave進行管理
        this.bossSpawned = false;
        this.titanBoss = null;
        this.enemiesSpawnedInWave = 0;
        this.waveTotalEnemies = 10;
        this.wave3MidBossSpawned = false;

        // レリック3択モーダルの多重起動ガード
        this.relicModalOpen = false;

        // 強くてニューゲーム（周回）＆ スコア
        this.loopCount = 0;
        this.score = 0;
        this.bestScore = Number(safeStorage.get('sakamichiTD_bestScore')) || 0;
    }

    addScore(amount) {
        this.score += Math.round(amount);
    }

    // 敵 1 体を倒したとき（CombatManager.rewardDeadEnemies から 1 体につき 1 回呼ばれる）
    registerKill(enemy) {
        this.addScore((enemy?.manaReward || 0) * SCORE_PER_MANA_REWARD);
    }

    saveBestScoreIfNeeded() {
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            safeStorage.set('sakamichiTD_bestScore', String(this.bestScore));
        }
    }

    // 出撃・必殺技を受け付ける状態か（一時停止中・レリック3択中・勝敗確定後は受け付けない）
    canAct() {
        return !this.isPaused && !this.relicModalOpen && !this.isGameOver && !this.isVictory;
    }

    isPinballManaBoost() {
        return !!(this.skillManager && this.skillManager.pinballTimer > 0);
    }

    useSkill(skillId) {
        if (!this.canAct()) return false;
        return this.skillManager.triggerSkill(skillId);
    }

    togglePause() {
        if (this.relicModalOpen || this.isGameOver || this.isVictory) return;
        this.isPaused = !this.isPaused;
        this.updatePauseUI();
    }

    updatePauseUI() {
        const pauseBtn = document.getElementById('btn-pause');
        if (pauseBtn) {
            pauseBtn.textContent = this.isPaused && !this.relicModalOpen ? '▶ 再開' : '⏸ 一時停止';
            pauseBtn.classList.toggle('active', this.isPaused && !this.relicModalOpen);
        }
    }

    // 音のミュート・音量（設定は保存して次回も引き継ぐ）
    loadSoundSettings() {
        const savedVolume = Number(safeStorage.get('sakamichiTD_volume'));
        if (safeStorage.get('sakamichiTD_volume') !== null && Number.isFinite(savedVolume)) {
            window.soundEngine.setVolume(savedVolume);
        }
        if (safeStorage.get('sakamichiTD_muted') === '1') {
            window.soundEngine.setEnabled(false);
        }
        this.updateSoundUI();
    }

    toggleMute() {
        window.soundEngine.setEnabled(!window.soundEngine.enabled);
        safeStorage.set('sakamichiTD_muted', window.soundEngine.enabled ? '0' : '1');
        this.updateSoundUI();
    }

    setVolume(volume) {
        window.soundEngine.setVolume(volume);
        safeStorage.set('sakamichiTD_volume', String(window.soundEngine.volume));
        // 音量を上げる操作はミュート解除の意思とみなす
        if (!window.soundEngine.enabled && window.soundEngine.volume > 0) {
            window.soundEngine.setEnabled(true);
            safeStorage.set('sakamichiTD_muted', '0');
        }
        this.updateSoundUI();
    }

    updateSoundUI() {
        const muteBtn = document.getElementById('btn-mute');
        if (muteBtn) {
            muteBtn.textContent = window.soundEngine.enabled ? '🔊 音: ON' : '🔇 音: OFF';
            muteBtn.classList.toggle('active', !window.soundEngine.enabled);
        }
        const slider = document.getElementById('volumeSlider');
        if (slider) slider.value = String(Math.round(window.soundEngine.volume * 100));
    }

    // ボタンの説明・コストを定数（BALL_TYPES / SPECIAL_SKILLS）から作る（HTML 直書きとの食い違いを防ぐ）
    populateControlLabels() {
        document.querySelectorAll('.ball-btn').forEach(btn => {
            const config = BALL_TYPES[btn.dataset.type.toUpperCase()];
            if (!config) return;
            const hotkey = btn.querySelector('.btn-hotkey')?.textContent?.trim();
            btn.title = `${config.name}【${config.role}】${config.cost} MP${hotkey ? ` (キー: ${hotkey})` : ''}\n${config.desc}`;
            const costEl = btn.querySelector('.btn-cost');
            if (costEl) costEl.textContent = `${config.cost} MP`;
        });
        document.querySelectorAll('.skill-btn').forEach(btn => {
            const config = SPECIAL_SKILLS[btn.dataset.skill.toUpperCase()];
            if (!config) return;
            btn.title = `${config.icon} ${config.name} (キー: ${config.key}・待機 ${config.cooldown} 秒)\n${config.desc}`;
            const keyEl = btn.querySelector('.skill-hotkey');
            if (keyEl) keyEl.textContent = config.key;
            const iconEl = btn.querySelector('.skill-icon');
            if (iconEl) iconEl.textContent = config.icon;
        });
    }

    finalizeVictory() {
        this.isVictory = true;
        window.soundEngine.playVictory();
        this.saveBestScoreIfNeeded();
        const scoreEl = document.getElementById('victoryScoreText');
        if (scoreEl) scoreEl.textContent = `スコア: ${this.score}（ベスト: ${this.bestScore}）`;
        const loopBtn = document.getElementById('btn-loop-continue');
        if (loopBtn) loopBtn.innerHTML = `🔁 強くてニューゲーム (${this.loopCount + 2}周目へ)<br><small>敵の攻撃力と防御力が ${this.loopCount + 2} 倍に</small>`;
        document.getElementById('victoryModal')?.classList.remove('hidden');
    }

    finalizeDefeat() {
        this.isGameOver = true;
        window.soundEngine.playDefeat();
        this.saveBestScoreIfNeeded();
        const scoreEl = document.getElementById('defeatScoreText');
        if (scoreEl) scoreEl.textContent = `スコア: ${this.score}（ベスト: ${this.bestScore}）`;
        document.getElementById('defeatModal')?.classList.remove('hidden');
    }

    // 強くてニューゲーム：レリックとスコアを引き継いだまま、敵を強化してWave1から周回する
    startNewGamePlus() {
        this.loopCount++;
        this.isVictory = false;
        this.isGameOver = false;
        this.relicModalOpen = false;
        document.getElementById('victoryModal')?.classList.add('hidden');

        if (this.stage !== 2) this.toggleStage();

        this.allyBase.hp = this.allyBase.maxHp;
        this.enemyBase.hasBarrier = true;
        this.enemyBase.hp = this.enemyBase.maxHp;

        this.combatManager.clearAllAllies();
        this.combatManager.enemies = [];
        this.bossSpawned = false;
        this.titanBoss = null;

        this.startWave(1);
    }

    // 敵ステータスに周回インフレ倍率を適用（強くてニューゲーム用）
    applyLoopScaling(enemy) {
        if (this.loopCount <= 0) return;
        // 2 周目は敵の攻撃力・防御力が 2 倍、3 周目は 3 倍、4 周目は 4 倍…（クリアしても遊び続けられるように）
        // 防御力 N 倍 = 受けるダメージが 1/N（Enemy.takeDamage の loopDefense）
        const mult = this.loopCount + 1;
        enemy.atk = Math.round(enemy.atk * mult);
        enemy.loopDefense = mult;
        enemy.manaReward = Math.round(enemy.manaReward * (1 + this.loopCount * 0.5));
    }

    init() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Stage 1 (手描きスケッチの3段ジグザグスロープ)
        this.coursePath = createStage1Path();

        this.effectManager = new EffectManager();
        this.combatManager = new CombatManager();
        this.skillManager = new SkillManager();

        this.allyBase = new BaseBuilding(this.coursePath.allyGate, 600, true);
        this.enemyBase = new BaseBuilding(this.coursePath.enemyBase, 1500, false);

        this.combatManager.init(this.allyBase, this.enemyBase, this.effectManager, this.relicState, this.coursePath);
        this.skillManager.init(this.combatManager, this.effectManager, this.relicState, this.coursePath);

        this.populateControlLabels();
        this.loadSoundSettings();
        this.bindEvents();
        this.updatePauseUI();
        this.startWave(1);

        this.lastTime = performance.now();
        requestAnimationFrame(this.loop.bind(this));
    }

    bindEvents() {
        const unlockAudio = () => {
            window.soundEngine.init();
            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
        };
        window.addEventListener('click', unlockAudio);
        window.addEventListener('keydown', unlockAudio);

        // ボール召喚ボタン
        document.querySelectorAll('.ball-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                this.spawnBall(type);
            });
        });

        // 必殺技ボタン
        document.querySelectorAll('.skill-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const skillId = btn.dataset.skill;
                this.useSkill(skillId);
            });
        });

        // 一時停止ボタン（キーボードの無いスマホでも止められるように）
        document.getElementById('btn-pause')?.addEventListener('click', () => {
            this.togglePause();
        });

        // 一時停止中の画面をタップしても再開できる
        this.canvas.addEventListener('click', () => {
            if (this.isPaused && !this.relicModalOpen) this.togglePause();
        });

        // 音のミュート・音量
        document.getElementById('btn-mute')?.addEventListener('click', () => {
            this.toggleMute();
        });
        document.getElementById('volumeSlider')?.addEventListener('input', (e) => {
            this.setVolume(Number(e.target.value) / 100);
        });

        // デバッグツールボタン
        document.getElementById('btn-mana')?.addEventListener('click', () => {
            this.infiniteMana = !this.infiniteMana;
            if (this.infiniteMana) this.mana = this.maxMana;
            this.updateDebugUI();
        });

        document.getElementById('btn-speed')?.addEventListener('click', () => {
            if (this.gameSpeed === 1.0) this.gameSpeed = 2.0;
            else if (this.gameSpeed === 2.0) this.gameSpeed = 3.0;
            else this.gameSpeed = 1.0;
            this.updateDebugUI();
        });

        document.getElementById('btn-relic-select')?.addEventListener('click', () => {
            this.openRelicModal();
        });

        document.getElementById('btn-reset-skills')?.addEventListener('click', () => {
            for (const k in this.skillManager.cooldowns) {
                this.skillManager.cooldowns[k] = 0;
            }
        });

        // ステージ切り替えボタン (Stage 1 / Stage 2)
        document.getElementById('btn-toggle-stage')?.addEventListener('click', () => {
            this.toggleStage();
        });

        // ボスWaveへ即時スキップボタン
        document.getElementById('btn-skip-boss')?.addEventListener('click', () => {
            this.skipToBossWave();
        });

        // キーボードショートカット
        window.addEventListener('keydown', (e) => {
            // Space はフォーカス中のボタン（直前にクリックした出撃ボタン等）を押下扱いにしてしまうため、
            // ブラウザ既定動作を止める（一時停止のつもりがボールが出撃する事故の防止）
            if (e.code === 'Space') e.preventDefault();

            // レリック3択中・勝敗確定後はゲーム操作キーを受け付けない
            // （Space でモーダル表示中に一時停止が解除される、裏で出撃・必殺技が発動する等の防止）
            if (this.relicModalOpen || this.isGameOver || this.isVictory) return;

            if (e.key === '1') this.spawnBall('pingpong');
            else if (e.key === '2') this.spawnBall('iron');
            else if (e.key === '3') this.spawnBall('spike');
            else if (e.key === '4') this.spawnBall('super');
            else if (e.key === '5') this.spawnBall('bomb');
            else if (e.key.toLowerCase() === 'q') this.useSkill('giga_rock');
            else if (e.key.toLowerCase() === 'w') this.useSkill('booster_slope');
            else if (e.key.toLowerCase() === 'e') this.useSkill('pinball_fever');
            else if (e.key.toLowerCase() === 'n') this.toggleMute();
            else if (e.key.toLowerCase() === 'm') {
                this.infiniteMana = !this.infiniteMana;
                if (this.infiniteMana) this.mana = this.maxMana;
                this.updateDebugUI();
            } else if (e.key.toLowerCase() === 'r') {
                this.openRelicModal();
            } else if (e.key.toLowerCase() === 'c') {
                for (const k in this.skillManager.cooldowns) this.skillManager.cooldowns[k] = 0;
            } else if (e.key.toLowerCase() === 't') {
                this.toggleStage();
            } else if (e.key.toLowerCase() === 'b') {
                this.skipToBossWave();
            } else if (e.code === 'Space') {
                this.togglePause();
            }
        });

        // リトライボタン
        document.getElementById('btn-retry')?.addEventListener('click', () => location.reload());
        document.getElementById('btn-retry-win')?.addEventListener('click', () => location.reload());

        // 強くてニューゲーム（周回）ボタン
        document.getElementById('btn-loop-continue')?.addEventListener('click', () => {
            this.startNewGamePlus();
        });
    }

    // ボスWaveへ即時スキップ（デバッグ用）
    skipToBossWave() {
        if (this.isGameOver || this.isVictory) return;
        // レリック3択中にスキップすると、選択時のコールバックで startWave(4 + 1) が走り
        // 「Wave 5 / 4」になってしまうため受け付けない
        if (this.relicModalOpen) return;
        // 既にボスWave中に再実行すると、タイタンが2体目以降として湧き、
        // HPバーと撃破演出が最初の1体を追跡しなくなるため受け付けない
        if (this.wave >= this.maxWave && this.bossSpawned) return;
        this.startWave(this.maxWave);
    }

    toggleStage() {
        const oldTotalLength = this.coursePath.totalLength;
        this.stage = this.stage === 1 ? 2 : 1;
        this.coursePath = this.stage === 1 ? createStage1Path() : createStage2Path();
        const newTotalLength = this.coursePath.totalLength;
        const ratio = oldTotalLength > 0 ? newTotalLength / oldTotalLength : 1;

        this.allyBase.x = this.coursePath.allyGate.x;
        this.allyBase.y = this.coursePath.allyGate.y;

        this.enemyBase.x = this.coursePath.enemyBase.x;
        this.enemyBase.y = this.coursePath.enemyBase.y;

        this.combatManager.setCoursePath(this.coursePath);
        this.skillManager.setCoursePath(this.coursePath);
        this.effectManager.relayoutBumpers(this.coursePath);

        // 既存ユニットの位置補正（コース総延長比でsを再スケールしてから再投影する）
        this.combatManager.allies.forEach(a => {
            a.coursePath = this.coursePath;
            a.s *= ratio;
            a.updateCoordinates();
        });
        this.combatManager.enemies.forEach(e => {
            e.coursePath = this.coursePath;
            e.s *= ratio;
            e.updateCoordinates();
        });

        const stageBtn = document.getElementById('btn-toggle-stage');
        if (stageBtn) stageBtn.textContent = `Stage: ${this.stage}`;

        document.getElementById('stageDisplay').textContent = `Stage ${this.stage} - ${this.stage === 1 ? 'クラシックスロープ' : 'ロングスロープ'}`;
    }

    updateDebugUI() {
        const manaBtn = document.getElementById('btn-mana');
        if (manaBtn) {
            manaBtn.textContent = this.infiniteMana ? '無限マナ: ON' : '無限マナ: OFF';
            manaBtn.classList.toggle('active', this.infiniteMana);
        }
        const speedBtn = document.getElementById('btn-speed');
        if (speedBtn) {
            speedBtn.textContent = `速度: ${this.gameSpeed}x`;
        }
    }

    addMana(amount) {
        this.mana = Math.min(this.maxMana, this.mana + amount);
    }

    // 右上自陣ゲート（s=0）からボールを出撃
    spawnBall(typeKey) {
        if (!this.canAct()) return;
        const config = BALL_TYPES[typeKey.toUpperCase()];
        if (!config) return;

        if (this.ballCooldowns[typeKey] > 0) return;
        if (!this.infiniteMana && this.mana < config.cost) return;

        // 場のボールが上限に達していたら出撃しない（マナもクールダウンも消費しない）
        if (this.combatManager.allies.length >= GAME_CONFIG.MAX_ALLIES) {
            this.effectManager.spawnDamageText(this.allyBase.x, this.allyBase.y + 30, '満員!', false, '#feca57');
            return;
        }

        if (!this.infiniteMana) {
            this.mana -= config.cost;
        }
        this.ballCooldowns[typeKey] = config.cooldown;

        // コース開始点 s=0
        const ball = new Ball(0, typeKey.toUpperCase(), this.coursePath, this.relicState);
        this.combatManager.addAlly(ball);
    }

    startWave(waveNum) {
        this.wave = waveNum;
        this.waveActive = true;
        this.waveTimer = 0;
        this.enemySpawnTimer = 0;
        this.enemiesSpawnedInWave = 0;
        this.bossDefeatedTriggered = false;
        this.wave3MidBossSpawned = false;

        // Waveごとの敵部隊総数設定
        // ウェーブ 1〜3 は ENEMY_TUNING.COUNT_MULT 倍（押し合いになるよう増やした）。ボスのウェーブ 4 の護衛は元のまま
        const mult = ENEMY_TUNING.COUNT_MULT;
        if (this.wave === 1) this.waveTotalEnemies = Math.round(10 * mult);
        else if (this.wave === 2) this.waveTotalEnemies = Math.round(12 * mult);
        else if (this.wave === 3) this.waveTotalEnemies = Math.round(14 * mult);
        else this.waveTotalEnemies = 16;

        // 敵要塞のフォースバリア展開（Wave 1〜3での早期破壊クリアを完全防止）
        this.enemyBase.hasBarrier = true;

        if (this.wave === 4) {
            document.getElementById('waveDisplay').textContent = 'Wave 4 - ⚠️ 最終決戦 ⚠️';

            // 【新仕様】ボスWave突入演出：味方ボール全消し ＆ マナ急速チャージ ＆ 巨大ボス降臨
            this.bossSpawned = true;
            this.combatManager.clearAllAllies();
            this.mana = this.maxMana; // マナ緊急全快チャージ！

            this.effectManager.triggerWarning('⚠️ WARNING! 超巨神タイタン襲来 ⚠️', 4.0);
            window.soundEngine.playWarningSiren();

            // 超巨神タイタンボスを左下要塞から出撃！
            const titan = new Enemy(this.coursePath.totalLength, 'TITAN_GOLEM', this.coursePath);
            this.applyLoopScaling(titan);
            this.combatManager.addEnemy(titan);
            this.titanBoss = titan;
            this.enemiesSpawnedInWave++;
        } else {
            document.getElementById('waveDisplay').textContent = `Wave ${this.wave} / ${this.maxWave}`;
        }
    }

    updateWaveSpawner(dt) {
        if (!this.waveActive || this.isGameOver || this.isVictory) return;

        this.waveTimer += dt;
        this.enemySpawnTimer += dt;

        // スポーン間隔（3体まとめて出た後に一息つく緩急のあるテンポ）
        let spawnInterval = Math.max(1.6, 3.8 - this.wave * 0.4);
        if (this.wave < this.maxWave) spawnInterval *= ENEMY_TUNING.SPAWN_INTERVAL_MULT;
        if (this.enemiesSpawnedInWave % 4 === 3) spawnInterval *= 1.8;

        if (this.enemiesSpawnedInWave < this.waveTotalEnemies && this.enemySpawnTimer >= spawnInterval) {
            this.enemySpawnTimer = 0;
            this.spawnEnemyForCurrentWave();
            this.enemiesSpawnedInWave++;
        }

        // Waveクリア判定
        if (this.wave < this.maxWave) {
            // 通常Wave (1〜3): 設定された敵部隊をすべて倒したらクリア！
            if (this.enemiesSpawnedInWave >= this.waveTotalEnemies && this.combatManager.enemies.length === 0) {
                this.onWaveClear();
            }
        } else {
            // Wave 4 (ボスWave):
            // ① タイタンボスが倒された瞬間の戦況演出
            if (this.titanBoss && !this.titanBoss.isAlive && !this.bossDefeatedTriggered) {
                this.bossDefeatedTriggered = true;
                this.effectManager.triggerBossDefeated('👑 BOSS DEFEATED! 残敵を殲滅せよ！', 3.5);
                this.effectManager.spawnExplosion(this.titanBoss.x, this.titanBoss.y, 110);
                window.soundEngine.playExplosion();
                this.addScore(1000);
                // ボス撃破後は護衛の追加湧きを打ち止めにし、残存部隊の掃討に集中させる
                this.enemiesSpawnedInWave = this.waveTotalEnemies;
            }

            // ② 【完全制圧の厳格判定】タイタンボスを撃破し、かつ、すべての残存敵部隊が全滅したときに初めて完全勝利！
            if (this.bossSpawned && this.titanBoss && !this.titanBoss.isAlive && this.combatManager.enemies.length === 0 && !this.isVictory) {
                this.enemyBase.hasBarrier = false;
                this.enemyBase.hp = 0;
                this.effectManager.spawnExplosion(this.enemyBase.x, this.enemyBase.y, 120);
                this.finalizeVictory();
            }
        }
    }

    // 左下敵要塞（s = totalLength）から敵を出撃
    spawnEnemyForCurrentWave() {
        let enemyKey = 'GOBLIN';

        if (this.wave === 1) {
            // Wave 1: ゴブリン歩兵 ＋ 酸液自爆スライム（ピンポン単騎だと自爆で溶かされる）
            // 10 体ごとに 1 体（9・19 体目）トルネード・ゴーレムを混ぜ、Wave2の"予告編"にする
            if (this.enemiesSpawnedInWave % 10 === 8) {
                enemyKey = 'TORNADO_GOLEM';
            } else {
                enemyKey = Math.random() < 0.65 ? 'GOBLIN' : 'ACID_SLIME';
            }
        } else if (this.wave === 2) {
            // Wave 2: トルネード・ゴーレム（吹き飛ばし突風）＋ 重装シールド兵 ＋ アーチャー ＋ ゴブリン
            const r = Math.random();
            if (r < 0.30) enemyKey = 'TORNADO_GOLEM';
            else if (r < 0.60) enemyKey = 'SHIELD';
            else if (r < 0.85) enemyKey = 'ARCHER';
            else enemyKey = 'GOBLIN';
        } else if (this.wave === 3) {
            // Wave 3: トルネード・ゴーレム ＋ 重装ブルドーザー ＋ シャドウ・ゴースト ＋ スピードウルフ
            // 終盤（10体目）に死蔵されていたアイアンゴーレムを中ボスとして1体だけ投入し、Wave4への踏み台にする
            if (this.enemiesSpawnedInWave === 9 && !this.wave3MidBossSpawned) {
                this.wave3MidBossSpawned = true;
                enemyKey = 'GOLEM_BOSS';
                this.effectManager.spawnDamageText(this.enemyBase.x, this.enemyBase.y - 40, '⚔️ 中ボス出現！', true, '#f39c12');
            } else {
                const r = Math.random();
                if (r < 0.30) enemyKey = 'TORNADO_GOLEM';
                else if (r < 0.55) enemyKey = 'BULLDOZER';
                else if (r < 0.75) enemyKey = 'GHOST';
                else if (r < 0.90) enemyKey = 'WOLF';
                else enemyKey = 'ARCHER';
            }
        } else if (this.wave >= 4) {
            // Wave 4: タイタンボスの親衛隊部隊（トルネード ＋ ブルドーザー ＋ アーチャー ＋ 酸スライム）
            const r = Math.random();
            if (r < 0.35) enemyKey = 'TORNADO_GOLEM';
            else if (r < 0.65) enemyKey = 'BULLDOZER';
            else if (r < 0.85) enemyKey = 'ARCHER';
            else enemyKey = 'ACID_SLIME';
        }

        const enemy = new Enemy(this.coursePath.totalLength, enemyKey, this.coursePath);
        this.applyLoopScaling(enemy);
        this.combatManager.addEnemy(enemy);
    }

    onWaveClear() {
        this.waveActive = false;
        window.soundEngine.playVictory();
        this.addScore(300 * this.wave);

        if (this.wave < this.maxWave) {
            this.openRelicModal(() => {
                this.startWave(this.wave + 1);
            });
        }
    }

    openRelicModal(callbackOnSelect = null) {
        // 自動表示中のモーダル（Wave進行コールバック保持）をデバッグ操作が上書きして
        // 進行不能になる事故を防ぐガード
        if (this.relicModalOpen) return;

        const options = this.skillManager.getRandomRelicOptions(3);
        const modal = document.getElementById('relicModal');
        const container = document.getElementById('relicCardsContainer');
        container.innerHTML = '';

        if (options.length === 0) {
            // 全レリック取得済み（重ねがけはしない仕様）。3 択は出さずにそのまま進める
            this.effectManager.spawnDamageText(GAME_CONFIG.CANVAS_WIDTH / 2, GAME_CONFIG.CANVAS_HEIGHT * 0.4, '✨ レリック コンプリート！', true, '#feca57');
            if (callbackOnSelect) callbackOnSelect();
            return;
        }

        // 一時停止中に開いた（デバッグの R）なら、選んだ後も一時停止のままにする
        const wasPaused = this.isPaused;
        this.relicModalOpen = true;
        this.isPaused = true;
        this.updatePauseUI();

        options.forEach(relic => {
            const card = document.createElement('div');
            card.className = `relic-card ${relic.rarity.toLowerCase()}`;
            card.innerHTML = `
                <div class="card-badge">${relic.rarity}</div>
                <div class="card-icon">${relic.icon}</div>
                <div class="card-title">${relic.name}</div>
                <div class="card-desc">${relic.desc}</div>
            `;
            card.addEventListener('click', () => {
                // 連打・同時タップで 2 枚目が処理され、Wave が多重に進むのを防ぐ
                if (!this.relicModalOpen) return;
                this.skillManager.acquireRelic(relic);
                modal.classList.add('hidden');
                this.relicModalOpen = false;
                this.isPaused = wasPaused;
                this.updatePauseUI();
                this.renderActiveRelicsUI();
                if (callbackOnSelect) callbackOnSelect();
            });
            container.appendChild(card);
        });

        modal.classList.remove('hidden');
    }

    renderActiveRelicsUI() {
        const container = document.getElementById('activeRelicsBar');
        if (!container) return;
        container.innerHTML = '';
        this.skillManager.activeRelics.forEach(r => {
            const icon = document.createElement('span');
            icon.className = 'relic-badge';
            icon.title = `${r.name}: ${r.desc}`;
            icon.textContent = r.icon;
            container.appendChild(icon);
        });
    }

    loop(timestamp) {
        const rawDt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
        this.lastTime = timestamp;

        const dt = rawDt * (this.isPaused ? 0 : this.gameSpeed);

        if (!this.isPaused) {
            if (this.infiniteMana) {
                this.mana = this.maxMana;
            } else {
                // ピンボール・フィーバーが出ている間はマナの回復が 3 倍（効果が目に見えるように。v3）
                const regenMult = this.isPinballManaBoost() ? 3 : 1;
                this.mana = Math.min(this.maxMana, this.mana + this.manaRegen * regenMult * dt);
            }

            for (const k in this.ballCooldowns) {
                if (this.ballCooldowns[k] > 0) {
                    this.ballCooldowns[k] = Math.max(0, this.ballCooldowns[k] - dt);
                }
            }

            if (this.relicState.fortress_repair) {
                this.allyBase.heal(this.allyBase.maxHp * 0.03 * dt);
            }

            const isBooster = this.skillManager.isBoosterActive();

            const continueGame = this.effectManager.update(dt, isBooster);
            if (continueGame) {
                this.combatManager.update(dt, isBooster);
                this.skillManager.update(dt);
                this.allyBase.update(dt);
                this.enemyBase.update(dt);
                this.updateWaveSpawner(dt);
            }

            if (!this.isGameOver && !this.isVictory) {
                if (this.allyBase.hp <= 0) {
                    this.finalizeDefeat();
                } else if (this.enemyBase.hp <= 0 && !this.enemyBase.hasBarrier) {
                    // 敵要塞破壊による完全制圧（バリア解除後、かつ敵部隊が残っていない場合）
                    if (!this.bossSpawned || (this.titanBoss && !this.titanBoss.isAlive && this.combatManager.enemies.length === 0)) {
                        this.finalizeVictory();
                    }
                }
            }
        }

        this.render();
        this.updateHUD();

        requestAnimationFrame(this.loop.bind(this));
    }

    render() {
        const ctx = this.ctx;
        const w = GAME_CONFIG.CANVAS_WIDTH;
        const h = GAME_CONFIG.CANVAS_HEIGHT;

        ctx.save();
        ctx.translate(this.effectManager.shakeX, this.effectManager.shakeY);

        // 1. スロープ背景（木目・トイ調デスク）
        ctx.fillStyle = '#181e24';
        ctx.fillRect(0, 0, w, h);

        // 背景グリッド（スケッチのノート風の方眼・ガイドライン）
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 1;
        for (let x = 0; x < w; x += 30) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let y = 0; y < h; y += 30) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // 2. スケッチ通りの「板（スロープ台）」と点線矢印レールを描画
        const isBooster = this.skillManager.isBoosterActive();
        this.effectManager.renderBoards(ctx, this.coursePath, isBooster);

        // 3. 拠点（右上自陣ゲート・左下敵要塞）描画
        this.allyBase.render(ctx);
        this.enemyBase.render(ctx);

        // 4. 必殺技（ギガロック等）描画
        this.skillManager.render(ctx);

        // 5. 戦闘ユニット（ボール・敵）描画
        this.combatManager.render(ctx);

        // 6. パーティクル・バンパー・ダメージテキスト描画
        this.effectManager.render(ctx);

        // 7. ボス大型HPバー（Wave 4 でボス生存時）
        if (this.titanBoss && this.titanBoss.isAlive) {
            ctx.save();
            const barW = 320;
            const barH = 12;
            const bx = (w - barW) / 2;
            const by = 22;

            // 背景プレート
            ctx.fillStyle = 'rgba(15, 15, 20, 0.9)';
            ctx.fillRect(bx - 8, by - 16, barW + 16, barH + 24);
            ctx.strokeStyle = '#d63031';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(bx - 8, by - 16, barW + 16, barH + 24);

            // ボス名プレート
            ctx.font = 'bold 11px sans-serif';
            ctx.fillStyle = '#ff7675';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText('👑 超巨神 タイタン (SUPER BOSS)', bx, by - 6);

            // HPテキスト
            ctx.textAlign = 'right';
            ctx.fillText(`${Math.round(this.titanBoss.hp)} / ${this.titanBoss.maxHp}`, bx + barW, by - 6);

            // HPバー背景
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(bx, by + 1, barW, barH);

            // HPバー本体（グラデーション）
            const fillPct = Math.max(0, this.titanBoss.hp / this.titanBoss.maxHp);
            const fillW = barW * fillPct;
            const hpGrad = ctx.createLinearGradient(bx, 0, bx + barW, 0);
            hpGrad.addColorStop(0, '#c0392b');
            hpGrad.addColorStop(0.5, '#e74c3c');
            hpGrad.addColorStop(1, '#f39c12');
            ctx.fillStyle = hpGrad;
            ctx.fillRect(bx, by + 1, fillW, barH);

            // 光彩ライン
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.fillRect(bx, by + 1, fillW, 2);

            ctx.restore();
        }

        ctx.restore();

        // 8. 画面全体に掛かる帯・暗転は揺れの外で描く
        this.effectManager.renderOverlays(ctx);

        // 9. 一時停止中の表示（レリック3択中はモーダルが出ているので出さない）
        if (this.isPaused && !this.relicModalOpen && !this.isGameOver && !this.isVictory) {
            this.renderPauseOverlay(ctx, w, h);
        }
    }

    renderPauseOverlay(ctx, w, h) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, w, h);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 30px "Arial Black", sans-serif';
        ctx.fillText('⏸ 一時停止中', w / 2, h * 0.45);
        ctx.font = 'bold 13px sans-serif';
        ctx.fillStyle = '#d2dae2';
        ctx.fillText('Space キー・画面タップ・「再開」ボタンで再開', w / 2, h * 0.45 + 36);
        ctx.restore();
    }

    updateHUD() {
        const scoreDisplay = document.getElementById('scoreDisplay');
        if (scoreDisplay) {
            scoreDisplay.textContent = this.loopCount > 0
                ? `Score: ${this.score} (${this.loopCount + 1}周目)`
                : `Score: ${this.score}`;
        }

        const manaBar = document.getElementById('manaFill');
        const manaText = document.getElementById('manaText');
        if (manaBar && manaText) {
            const pct = Math.min(100, (this.mana / this.maxMana) * 100);
            manaBar.style.width = `${pct}%`;
            manaText.textContent = `${Math.floor(this.mana)} / ${this.maxMana}${this.isPinballManaBoost() ? ' ⚡×3' : ''}`;
        }

        const allyHpFill = document.getElementById('allyHpFill');
        const allyHpText = document.getElementById('allyHpText');
        if (allyHpFill && allyHpText) {
            const pct = Math.max(0, (this.allyBase.hp / this.allyBase.maxHp) * 100);
            allyHpFill.style.width = `${pct}%`;
            allyHpText.textContent = `${Math.round(this.allyBase.hp)} / ${this.allyBase.maxHp}`;
        }

        const enemyHpFill = document.getElementById('enemyHpFill');
        const enemyHpText = document.getElementById('enemyHpText');
        if (enemyHpFill && enemyHpText) {
            const pct = Math.max(0, (this.enemyBase.hp / this.enemyBase.maxHp) * 100);
            enemyHpFill.style.width = `${pct}%`;
            if (this.enemyBase.hasBarrier) {
                enemyHpText.textContent = `🛡️ 障壁中 (${Math.round(this.enemyBase.hp)})`;
                enemyHpFill.style.background = 'linear-gradient(90deg, #00cec9, #0984e3)';
            } else {
                enemyHpText.textContent = `${Math.round(this.enemyBase.hp)} / ${this.enemyBase.maxHp}`;
                enemyHpFill.style.background = 'linear-gradient(90deg, #b71540, #e74c3c)';
            }
        }

        document.querySelectorAll('.ball-btn').forEach(btn => {
            const type = btn.dataset.type;
            const config = BALL_TYPES[type.toUpperCase()];
            const cd = this.ballCooldowns[type];
            const cdOverlay = btn.querySelector('.cd-overlay');

            if (cd > 0) {
                btn.classList.add('disabled');
                if (cdOverlay) cdOverlay.style.height = `${(cd / config.cooldown) * 100}%`;
            } else if (!this.infiniteMana && this.mana < config.cost) {
                btn.classList.add('disabled');
                if (cdOverlay) cdOverlay.style.height = '0%';
            } else {
                btn.classList.remove('disabled');
                if (cdOverlay) cdOverlay.style.height = '0%';
            }
        });

        document.querySelectorAll('.skill-btn').forEach(btn => {
            const skillId = btn.dataset.skill;
            const config = SPECIAL_SKILLS[skillId.toUpperCase()];
            const cd = this.skillManager.cooldowns[skillId];
            const cdOverlay = btn.querySelector('.skill-cd-overlay');
            const cdText = btn.querySelector('.skill-cd-text');

            // まだ手に入れていない必殺技は鍵の表示（ウェーブクリアのレリックで手に入る。v4）
            const locked = !this.skillManager.isSkillUnlocked(skillId);
            btn.classList.toggle('locked', locked);
            if (locked) {
                btn.classList.remove('on-cooldown');
                if (cdOverlay) cdOverlay.style.height = '0%';
                if (cdText) cdText.textContent = '🔒';
            } else if (cd > 0) {
                btn.classList.add('on-cooldown');
                if (cdOverlay) cdOverlay.style.height = `${(cd / config.cooldown) * 100}%`;
                if (cdText) cdText.textContent = cd.toFixed(1) + 's';
            } else {
                btn.classList.remove('on-cooldown');
                if (cdOverlay) cdOverlay.style.height = '0%';
                if (cdText) cdText.textContent = '';
            }
        });
    }
}

window.onload = () => {
    window.gameManager = new GameManager();
    window.gameManager.init();
};
