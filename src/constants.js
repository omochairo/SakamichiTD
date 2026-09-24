/**
 * SakamichiTD - Game Constants, Course Path & Stage Definitions
 * 手描きスケッチに基づくジグザグ板スロープコースの数学的定義
 */

// コースパスのセグメント補間クラス
class CoursePath {
    constructor(points, boards, allyGate, enemyBase) {
        this.points = points;      // ウェイポイント配列 [{x, y}]
        this.boards = boards;      // 板（スロープ台）の描画定義 [{x1, y1, x2, y2, thickness}]
        this.allyGate = allyGate;  // 右上自陣ゲート位置 {x, y, radius}
        this.enemyBase = enemyBase;// 左下敵要塞位置 {x, y, radius}

        this.samples = [];
        this.totalLength = 0;
        this.buildArcLengthTable();
    }

    // ウェイポイント間を細かくサンプリングして累積距離テーブルを構築
    buildArcLengthTable() {
        this.samples = [];
        let accumulated = 0;

        for (let i = 0; i < this.points.length - 1; i++) {
            const p0 = this.points[i];
            const p1 = this.points[i + 1];
            const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
            const steps = Math.max(10, Math.ceil(dist / 4)); // 4px刻み

            for (let step = 0; step < steps; step++) {
                const t = step / steps;
                const x = p0.x + (p1.x - p0.x) * t;
                const y = p0.y + (p1.y - p0.y) * t;

                if (this.samples.length > 0) {
                    const prev = this.samples[this.samples.length - 1];
                    accumulated += Math.hypot(x - prev.x, y - prev.y);
                }

                this.samples.push({
                    s: accumulated,
                    x: x,
                    y: y,
                    tx: (p1.x - p0.x) / dist,
                    ty: (p1.y - p0.y) / dist
                });
            }
        }

        // 終点
        const lastP = this.points[this.points.length - 1];
        const prev = this.samples[this.samples.length - 1];
        accumulated += Math.hypot(lastP.x - prev.x, lastP.y - prev.y);
        const lastTx = prev.tx;
        const lastTy = prev.ty;
        this.samples.push({
            s: accumulated,
            x: lastP.x,
            y: lastP.y,
            tx: lastTx,
            ty: lastTy
        });

        this.totalLength = accumulated;
    }

    // 距離 s (0 <= s <= totalLength) における位置・接線・法線を取得
    getPointAt(s) {
        s = Math.max(0, Math.min(this.totalLength, s));

        // 二分探索
        let low = 0;
        let high = this.samples.length - 1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (this.samples[mid].s < s) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        const idx = Math.max(0, Math.min(this.samples.length - 2, low - 1));
        const s0 = this.samples[idx];
        const s1 = this.samples[idx + 1];

        const segLen = s1.s - s0.s;
        const t = segLen > 0.0001 ? (s - s0.s) / segLen : 0;

        const x = s0.x + (s1.x - s0.x) * t;
        const y = s0.y + (s1.y - s0.y) * t;
        const tx = s0.tx + (s1.tx - s0.tx) * t;
        const ty = s0.ty + (s1.ty - s0.ty) * t;
        const tLen = Math.hypot(tx, ty) || 1;
        const ntx = tx / tLen;
        const nty = ty / tLen;

        // 板の垂直法線（進行方向の左手系: 板の上側）
        // 進行方向が左(-1, 0)のとき法線は上(0, -1)
        // 進行方向が右(1, 0)のとき法線は上(0, -1)
        let nx = nty;
        let ny = -ntx;
        // 法線が下を向いている場合は上向きに補正
        if (ny > 0) {
            nx = -nx;
            ny = -ny;
        }

        const angle = Math.atan2(nty, ntx);

        return {
            x: x,
            y: y,
            tx: ntx,
            ty: nty,
            nx: nx,
            ny: ny,
            angle: angle,
            s: s
        };
    }
}

// Stage 1: 手描きスケッチに基づくクラシック3段ジグザグスロープ
function createStage1Path() {
    const allyGate = { x: 410, y: 80, radius: 26 };
    const enemyBase = { x: 75, y: 700, radius: 34 };

    // スロープ板の描画定義（厚み16pxの長方形の板）
    const boards = [
        // 板1（最上段スロープ）: 右上から左へ傾斜
        { x1: 440, y1: 135, x2: 70, y2: 215, thickness: 16 },
        // 板2（中段スロープ）: 左から右へ傾斜
        { x1: 50, y1: 310, x2: 430, y2: 395, thickness: 16 },
        // 板3（下段スロープ）: 右から左へ傾斜
        { x1: 440, y1: 505, x2: 80, y2: 645, thickness: 16 }
    ];

    // ボールが板の上を転がる中心ラインのウェイポイント
    const points = [
        // 自陣ゲート投入口
        { x: 410, y: 80 },
        { x: 410, y: 120 },

        // 板1の上（右から左へ下る）
        { x: 380, y: 130 },
        { x: 250, y: 155 },
        { x: 120, y: 185 },
        { x: 80, y: 200 },

        // ターン1（左端でカーブして板2へ落下・転入）
        { x: 45, y: 215 },
        { x: 35, y: 255 },
        { x: 50, y: 295 },
        { x: 85, y: 310 },

        // 板2の上（左から右へ下る）
        { x: 150, y: 325 },
        { x: 260, y: 350 },
        { x: 360, y: 375 },
        { x: 400, y: 390 },

        // ターン2（右端でカーブして板3へ落下・転入）
        { x: 435, y: 405 },
        { x: 445, y: 445 },
        { x: 430, y: 485 },
        { x: 390, y: 505 },

        // 板3の上（右から左へ下る）
        { x: 300, y: 530 },
        { x: 200, y: 570 },
        { x: 120, y: 615 },
        { x: 85, y: 645 },

        // 敵要塞アプローチ
        { x: 75, y: 685 }
    ];

    return new CoursePath(points, boards, allyGate, enemyBase);
}

// Stage 2: 後半ステージ用 4段ロングジグザグコース
function createStage2Path() {
    const allyGate = { x: 410, y: 70, radius: 26 };
    const enemyBase = { x: 75, y: 715, radius: 34 };

    const boards = [
        { x1: 440, y1: 110, x2: 70, y2: 175, thickness: 14 },
        { x1: 50, y1: 250, x2: 430, y2: 320, thickness: 14 },
        { x1: 440, y1: 400, x2: 60, y2: 480, thickness: 14 },
        { x1: 50, y1: 560, x2: 430, y2: 640, thickness: 14 },
        { x1: 440, y1: 670, x2: 80, y2: 710, thickness: 14 }
    ];

    const points = [
        { x: 410, y: 70 },
        { x: 410, y: 100 },
        { x: 380, y: 105 },
        { x: 100, y: 165 },
        { x: 45, y: 185 },
        { x: 35, y: 220 },
        { x: 70, y: 250 },
        { x: 380, y: 310 },
        { x: 435, y: 330 },
        { x: 445, y: 365 },
        { x: 400, y: 395 },
        { x: 100, y: 465 },
        { x: 45, y: 485 },
        { x: 35, y: 520 },
        { x: 70, y: 550 },
        { x: 380, y: 625 },
        { x: 435, y: 645 },
        { x: 440, y: 670 },
        { x: 390, y: 680 },
        { x: 80, y: 705 }
    ];

    return new CoursePath(points, boards, allyGate, enemyBase);
}

const GAME_CONFIG = {
    CANVAS_WIDTH: 480,
    CANVAS_HEIGHT: 800,
    
    GRAVITY_ACCEL: 45,     // 坂道の下り加速度 (px/s^2)
    MAX_SPEED_CAP: 340,    // 坂道での最大下り速度
    
    PUSH_SPEED_FACTOR: 14, // 押し合いパワー差1あたりの前線移動速度 (px/s)
    KNOCKBACK_DISTANCE: 32,// 初撃激突時のノックバック量 (px)
    
    MANA_MAX: 200,
    MANA_REGEN_BASE: 14,   // 毎秒回復量
};

// 味方ボールユニットの定義
const BALL_TYPES = {
    PINGPONG: {
        id: 'pingpong',
        name: 'ピンポン玉',
        cost: 25,
        cooldown: 0.8,
        hp: 35, // 耐久力を大幅にダウン（敵の攻撃1〜2発で割れる）
        atk: 8,
        attackInterval: 0.7,
        radius: 12,
        baseSpeed: 170,
        maxSpeed: 290,
        pushPower: 1,
        knockbackFactor: 0.3, // 軽量のため敵を弾き飛ばせない
        color: '#fffae0',
        strokeColor: '#f39c12',
        role: '壁役・時間稼ぎ',
        desc: '安価で連打可能。軽量の足止め壁役。耐久力は低く単体では倒されやすい。',
        spinMultiplier: 1.6,
        canKnockback: true,
        immuneKnockback: false,
    },
    IRON: {
        id: 'iron',
        name: '鉄球 (アイアン)',
        cost: 65,
        cooldown: 3.5,
        hp: 380,
        atk: 25,
        attackInterval: 1.2,
        radius: 19,
        baseSpeed: 95,
        maxSpeed: 180,
        pushPower: 3,
        knockbackFactor: 1.5, // 重厚な衝突で敵を大きく弾き飛ばす
        color: '#7f8c8d',
        strokeColor: '#2c3e50',
        role: '高耐久タンク',
        desc: '重厚な回転と重低音。高HPで敵の攻撃によるノックバックを無効化。ブルドーザー対策に必須。',
        spinMultiplier: 0.8,
        canKnockback: true,
        immuneKnockback: true,
    },
    SPIKE: {
        id: 'spike',
        name: 'トゲ玉',
        cost: 55,
        cooldown: 2.5,
        hp: 140,
        atk: 16,
        attackInterval: 0.8,
        radius: 15,
        baseSpeed: 135,
        maxSpeed: 240,
        pushPower: 2,
        knockbackFactor: 1.0,
        color: '#e74c3c',
        strokeColor: '#962d22',
        role: '持続アタッカー',
        desc: 'トゲを高速回転させ突撃。接触中の敵に0.2秒ごとに継続切断ダメージ。ゴーストや集団に特効。',
        spinMultiplier: 1.3,
        canKnockback: true,
        immuneKnockback: false,
        spikeDps: 22,
    },
    SUPER: {
        id: 'super',
        name: 'スーパーボール',
        cost: 75,
        cooldown: 3.0,
        hp: 120,
        atk: 38,
        attackInterval: 0.9,
        radius: 14,
        baseSpeed: 155,
        maxSpeed: 260,
        pushPower: 1,
        knockbackFactor: 0.8,
        color: '#00d2d3',
        strokeColor: '#01a3a4',
        role: '後衛狙撃アタッカー',
        desc: '坂をピョンピョン跳ねながら突進。前線を飛び越えて後衛のアーチャーを直接強襲・撃破する。',
        spinMultiplier: 1.2,
        canKnockback: true,
        immuneKnockback: false,
        jumpRange: 120,
    },
    BOMB: {
        id: 'bomb',
        name: 'ボムボール',
        cost: 105,
        cooldown: 4.5,
        hp: 125,
        atk: 130,
        attackInterval: 99,
        radius: 17,
        baseSpeed: 125,
        maxSpeed: 220,
        pushPower: 2,
        knockbackFactor: 2.5,
        color: '#2d3436',
        strokeColor: '#d63031',
        role: '自爆・範囲殲滅',
        desc: '導火線がパチパチ光りながら転がる。激突時に大爆発しブルドーザーや密集敵を一網打尽。',
        spinMultiplier: 1.0,
        canKnockback: true,
        immuneKnockback: false,
        isBomb: true,
        explosionRadius: 95,
    }
};

// エピック必殺技
const SPECIAL_SKILLS = {
    GIGA_ROCK: {
        id: 'giga_rock',
        name: '大落石 (ギガロック)',
        key: 'Q',
        cooldown: 28,
        icon: '🪨',
        desc: '右上から超特大の巨石がジグザグの板をゴロゴロ急降下！道中の敵を全員巻き込んで敵拠点まで一気に押し流す！'
    },
    BOOSTER_SLOPE: {
        id: 'booster_slope',
        name: 'ブースター・スロープ',
        key: 'W',
        cooldown: 22,
        icon: '🌈',
        desc: '10秒間、ジグザグの板が虹色に輝く！全味方ボールの速度が3倍＆初撃ダメージ3倍＆スピード線常時放出！'
    },
    PINBALL_FEVER: {
        id: 'pinball_fever',
        name: 'ピンボール・フィーバー',
        key: 'E',
        cooldown: 25,
        icon: '⚡',
        desc: '各スロープの隙間にネオンバンパーが多数出現！ボールが高速乱反射して敵軍をタコ殴りにする！'
    }
};

// パッシブ・エピックレリック（ウェーブクリア時 3択）
const RELIC_POOL = [
    {
        id: 'split_cell',
        name: '分裂セル',
        rarity: 'EPIC',
        icon: '✨',
        desc: 'ボールが敵に初激突した瞬間、前後に2個のミニボールへ「パカッ」と分裂する！',
    },
    {
        id: 'snowman_growth',
        name: '雪だるま式 (ジャイアント)',
        rarity: 'EPIC',
        icon: '⛄',
        desc: '坂を転がれば転がるほどボールが巨大化！HP・攻撃力・押し出しパワーが最大2.5倍に膨れ上がる！',
    },
    {
        id: 'jet_engine',
        name: 'ジェット噴射',
        rarity: 'EPIC',
        icon: '🚀',
        desc: '全ボールの後方にロケット噴射を搭載！突進初速+80 & 押し出しパワー常時+2！',
    },
    {
        id: 'magnet_fusion',
        name: 'マグネット吸着',
        rarity: 'EPIC',
        icon: '🧲',
        desc: '味方ボールに磁力が宿り、同種マージ合体の判定距離が大幅に拡大！離れていてもどんどん合体しやすくなる！',
    },
    {
        id: 'resonance_core',
        name: '共鳴コア',
        rarity: 'EPIC',
        icon: '🔮',
        desc: 'ボールが合体進化する度に、マナ+15回復＆周囲80px以内の味方ボールの攻撃タイマーが加速する！',
    },
    {
        id: 'heavy_impact',
        name: '超ゴツン衝撃波',
        rarity: 'RARE',
        icon: '💥',
        desc: '初撃の激突ボーナスが2倍から【3.5倍】に強化され、敵を2倍遠くへ吹き飛ばす！',
    },
    {
        id: 'ink_overdrive',
        name: 'マナ・オーバードライブ',
        rarity: 'RARE',
        icon: '⚡',
        desc: 'マナの自然回復速度が+50%上昇し、最大マナ容量が+60増加する。',
    },
    {
        id: 'fortress_repair',
        name: 'ナノリペア・ゲート',
        rarity: 'RARE',
        icon: '🛡️',
        desc: '自陣ゲートのHPが毎秒3%回復し、ゲート最大HPが+200増加する。',
    },
    {
        id: 'sharp_spikes',
        name: 'プラズマ・スパイク',
        rarity: 'RARE',
        icon: '⚙️',
        desc: 'トゲ玉の継続ダメージが2倍になり、ピンポン玉にも微細なトゲが付与される。',
    }
];

// 敵ユニットタイプ（多彩なバリエーションとアンチ特性）
const ENEMY_TYPES = {
    GOBLIN: {
        id: 'goblin',
        name: 'ゴブリン歩兵',
        hp: 65,
        atk: 10,
        attackInterval: 0.9,
        radius: 13,
        speed: 46,
        pushPower: 1,
        color: '#27ae60',
        strokeColor: '#1e8449',
        manaReward: 10,
        immuneKnockback: false,
    },
    SHIELD: {
        id: 'shield',
        name: '重装シールド兵',
        hp: 290,
        atk: 15,
        attackInterval: 1.3,
        radius: 18,
        speed: 30,
        pushPower: 3,
        color: '#d35400',
        strokeColor: '#a04000',
        manaReward: 22,
        immuneKnockback: true, // ピンポン玉でハメられないノックバック耐性！
        shieldGuard: 0.5,      // 初撃激突ダメージ50%カット
    },
    WOLF: {
        id: 'wolf',
        name: 'スピードウルフ',
        hp: 55,
        atk: 18,
        attackInterval: 0.6,
        radius: 12,
        speed: 85,
        pushPower: 1,
        color: '#8e44ad',
        strokeColor: '#5b2c6f',
        manaReward: 16,
        immuneKnockback: false,
    },
    BULLDOZER: {
        id: 'bulldozer',
        name: '重装ブルドーザー',
        hp: 380,
        atk: 25,
        attackInterval: 1.2,
        radius: 22,
        speed: 24,
        pushPower: 5, // 圧倒的押し出しパワー！
        color: '#f39c12',
        strokeColor: '#b71540',
        manaReward: 35,
        immuneKnockback: true, // 完全ノックバック無効
        isAreaAttack: true,    // 前方範囲なぎ払い！ピンポン玉をまとめて粉砕
        areaRadius: 40,
    },
    ARCHER: {
        id: 'archer',
        name: 'スケルトン・アーチャー',
        hp: 50,
        atk: 16,
        attackInterval: 1.4,
        radius: 13,
        speed: 32,
        pushPower: 1,
        color: '#bdc3c7',
        strokeColor: '#7f8c8d',
        manaReward: 20,
        immuneKnockback: false,
        isRanged: true,       // 後衛遠距離射撃！前線のピンポン玉を狙撃
        attackRange: 130,
    },
    ACID_SLIME: {
        id: 'acid_slime',
        name: '酸液自爆スライム',
        hp: 45,
        atk: 60,
        attackInterval: 99,
        radius: 14,
        speed: 52,
        pushPower: 1,
        color: '#a29bfe',
        strokeColor: '#6c5ce7',
        manaReward: 18,
        immuneKnockback: false,
        isAcidSuicide: true,  // 接触自爆！周囲のピンポン玉をまとめて溶かす
        suicideRadius: 75,
    },
    GHOST: {
        id: 'ghost',
        name: 'シャドウ・ゴースト',
        hp: 95,
        atk: 14,
        attackInterval: 0.8,
        radius: 13,
        speed: 42,
        pushPower: 1,
        color: '#74b9ff',
        strokeColor: '#0984e3',
        manaReward: 22,
        isGhost: true,        // すり抜け霊体！トゲ玉やボムボールが特効
        immuneKnockback: true,
    },
    TORNADO_GOLEM: {
        id: 'tornado_golem',
        name: 'トルネード・ゴーレム',
        hp: 260,
        atk: 20,
        attackInterval: 1.5,
        radius: 17,
        speed: 30,
        pushPower: 3,
        color: '#00cec9',
        strokeColor: '#0984e3',
        manaReward: 32,
        immuneKnockback: true,
        isTornado: true,       // 突風吹き飛ばし特性！
        repelForce: 120,       // 接触した味方ボールを坂の上へ120px弾き飛ばす！
    },
    GOLEM_BOSS: {
        id: 'golem_boss',
        name: 'アイアンゴーレム (BOSS)',
        hp: 1250,
        atk: 45,
        attackInterval: 1.5,
        radius: 28,
        speed: 24,
        pushPower: 7,
        color: '#c0392b',
        strokeColor: '#78281f',
        manaReward: 100,
        isBoss: true,
        immuneKnockback: true,
        isAreaAttack: true,
        areaRadius: 50,
    },
    TITAN_GOLEM: {
        id: 'titan_boss',
        name: '超巨神 タイタン (SUPER BOSS)',
        hp: 5200,                // 高耐久化：集中攻撃でも瞬殺されない重厚感
        atk: 65,
        attackInterval: 1.6,
        radius: 46,             // 直径92pxの超特大ボール！
        speed: 18,
        pushPower: 10,           // 圧倒的な質量で坂を押し登る
        bossArmor: 0.3,          // ボス特性：被ダメージ30%カット
        color: '#2d3436',
        strokeColor: '#d63031',
        manaReward: 300,
        isBoss: true,
        isTitan: true,
        immuneKnockback: true,
        isAreaAttack: true,
        areaRadius: 85,
        roarInterval: 5.5,      // 咆哮で前線ボールを吹き飛ばす
    }
};

window.CoursePath = CoursePath;
window.createStage1Path = createStage1Path;
window.createStage2Path = createStage2Path;
window.GAME_CONFIG = GAME_CONFIG;
window.BALL_TYPES = BALL_TYPES;
window.SPECIAL_SKILLS = SPECIAL_SKILLS;
window.RELIC_POOL = RELIC_POOL;
window.ENEMY_TYPES = ENEMY_TYPES;
