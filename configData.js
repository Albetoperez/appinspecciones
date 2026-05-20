const subMap = { "MEC": "MEC", "Vallado": "CIV-Vallado", "Drenajes": "CIV-Drenajes", "Caminos": "CIV-Caminos", "Apertura de zanjas tendido de cable": "ELE-Zanjas", "Tendido y conexionado de cable solar": "ELE-Cables", "Montaje de combiner box": "ELE-CB", "Conexionado cables MT": "ELE-MT" };
let configGeneral = { proyecto: "SIGMA - PARQUE FOTOVOLTAICO", cliente: "REPSOL", doc: "8GM-ITC-MEC-02", rev: "2B", logo: "", baselines: { "MEC": [0,0,0,0,0], "CIV-Vallado": [0,0,0,0,0], "CIV-Drenajes": [0,0,0,0,0], "CIV-Caminos": [0,0,0,0,0], "ELE-Zanjas": [0,0,0,0,0], "ELE-Cables": [0,0,0,0,0], "ELE-CB": [0,0,0,0,0], "ELE-MT": [0,0,0,0,0] } };

const pvhBaseHincado = ["Verificar tipo de perfil", "Verificar estado cabeza (fisura, galvanizado, mecanizado)", "Verificar torsión (revires)", "Verificar perforación (si procede)", "Verificar hormigonado (si procede)"];
const pvhBasePostHead = ["Verificar correcto montaje de post head", "Verificar correspondencia tipo de post head (perfil/pendiente)", "Verificar correcto montaje rodamiento de plástico"];
const pvhBaseTorqueTube = ["Verificar correspondencia del tubo torsor según zona", "Verificar unión en el testigo del empalme", "Verificar integridad del Torque Tube (Daños, abolladuras, galvanizado)", "Verificar tipo de empalme instalado"];
const pvhMotoraDrive = ["Empalme entre torque tubes", "Slew drive - Soporte", "Pilar central - Soporte motor", "Motor - Slew drive", "Drive arm - Torque tube", "Drive arm - Drive line", "Sujeción de controlador D-Box"];
const pvhGemelaDrive = ["Empalme entre torque tubes", "Drive arm - Torque tube", "Drive arm - Drive line"];
const pvhPanelMods = ["Verificar integridad (abolladuras, desviaciones)", "Verificar correspondencia según zona", "Verificar correcta instalación U-bolt"];
const pvhModulos = ["Instalación de módulos fotovoltaicos (JB, alineación, separación, posicionamiento y orientation)", "Instalación de panel central de alimentación (indicar orientación E/O)"];

const pvhParesAprieteMaster = [
    { desc: "Pilar (IPE140/220)-Post Head", tipo: "S24.70", metrica: "41", torque: "500", tol: "450-550", perPile: true },
    { desc: "Pilar (IPE160/CP)-Post Head", tipo: "S24.70", metrica: "41", torque: "300", tol: "270-330", perPile: true, soloBifila: true },
    { desc: "Rodamiento Post Head", tipo: "S8.25-30", metrica: "10", torque: "4", tol: "3-5", perPile: true },
    { desc: "Unión piezas Post Head", tipo: "S10.40", metrica: "16", torque: "46", tol: "40-55", perPile: true },
    { desc: "Empalme entre torque tubes", tipo: "S16.40", metrica: "24", torque: "198", tol: "180-220", perPile: false },
    { desc: "Slew drive - Soporte", tipo: "S20.65-75", metrica: "32", torque: "343", tol: "310-380", perPile: false, isMotor: true },
    { desc: "Pilar central - Soporte motor", tipo: "S20.50-70", metrica: "32", torque: "343", tol: "310-380", perPile: false, isMotor: true },
    { desc: "Motor - Slew drive", tipo: "Motor", metrica: "M10", torque: "28", tol: "25-31", perPile: false, isMotor: true },
    { desc: "Drive arm - Torque tube", tipo: "S16.40", metrica: "24", torque: "198", tol: "180-220", perPile: false },
    { desc: "Drive arm - Drive line", tipo: "S20.40-50", metrica: "30", torque: "200", tol: "180-220", perPile: false },
    { desc: "Sujeción de módulos", tipo: "S8.20-25", metrica: "10", torque: "17", tol: "10-20", perPile: false },
    { desc: "Panel rail - Torque tube", tipo: "S8.450", metrica: "13", torque: "12", tol: "10-20", perPile: false },
    { desc: "Stopper", tipo: "S8.450", metrica: "13", torque: "6", tol: "5-7", perPile: false },
    { desc: "Sujeción de controlador D-Box", tipo: "S8.450", metrica: "13", torque: "5", tol: "---", perPile: false, isMotor: true },
    { desc: "Sujeción de SBC", tipo: "S5.16-18", metrica: "8", torque: "10", tol: "8-12", perPile: false, isMotor: true }
];

const getParesApriete = (tipo) => pvhParesAprieteMaster
    .filter(item => !(tipo === 'MONOFILA' && item.soloBifila))
    .map(item => (tipo === 'GEMELA' && item.isMotor) ? { ...item, defaultNA: true } : item);

const pvhParesApriete = getParesApriete('MONOFILA');
const pvhParesAprieteBifilaMotora = getParesApriete('MOTORA');
const pvhParesAprieteBifilaGemela = getParesApriete('GEMELA');

const vAlt = (tipo, a, n) => {
    let obj = { desc: `Altura pilar ${tipo}`, ref: tipo.includes('HEA')?"1125":"1175", tol: "± 200", rango: tipo.includes('HEA')?"925 - 1325":"975 - 1375", perPile: true, min: tipo.includes('HEA')?925:975, max: tipo.includes('HEA')?1325:1375 };
    if (a) obj.activePiles = a;
    if (n) obj.naPiles = n;
    return obj;
};

const crearVerificaciones = (fila, configAltura) => [
    ...configAltura,
    { desc: "Verticalidad del pilar dirección E/O", ref: "90°", tol: "± 1°", rango: "89° - 91°", perPile: true, min: 89, max: 91 },
    { desc: "Verticalidad del pilar dirección N/S", ref: "90°", tol: "± 1°", rango: "89° - 91°", perPile: true, min: 89, max: 91 },
    { desc: "Revire del pilar (Cabeza)", ref: "90°", tol: "± 1.5°", rango: "88.5° - 91.5°", perPile: true, min: 88.5, max: 91.5 },
    { desc: "Alineación E/O de los pilares del seguidor", ref: "0", tol: "± 20", rango: "E/O", perPile: true, min: -20, max: 20 },
    { desc: "Alineación en altura de las cabezas de los pilares", ref: "0", tol: "± 20", rango: "Altura", perPile: true, min: -20, max: 20 },
    { desc: "Pitch", dynamicRef: "pitch", tol: "± 20", rango: "Dinámico", perPile: false, isNumeric: true },
    { desc: "Pendiente del seguidor N/S", ref: "≤ 4% / ≤ 8% / ≤ 15%", tol: "≤ 15%", rango: "asc / desc", perPile: false, isNumeric: true, min: -15, max: 15 },
    { desc: "Verticalidad de piruletas", ref: "90°", tol: "± 12.8°", rango: "77.2° - 102.8°", perPile: true, min: 77.2, max: 102.8 },
    { desc: "Verticalidad del soporte motor", ref: "90°", tol: "± 8°", rango: "82° - 98°", perPile: false, isNumeric: true, min: 82, max: 98, defaultNA: fila === 'GEMELA' },
    { desc: "Rotación del soporte motor", ref: "90°", tol: "± 4°", rango: "86° - 94°", perPile: false, isNumeric: true, min: 86, max: 94, defaultNA: fila === 'GEMELA' }
];

const pvhVerificaciones = [
    vAlt('IPE 220', null, [6]), vAlt('central HEA 140', [6]),
    { desc: "Verticalidad del pilar dirección E/O", ref: "90°", tol: "± 1°", rango: "89° - 91°", perPile: true, min: 89, max: 91 },
    { desc: "Verticalidad del pilar dirección N/S", ref: "90°", tol: "± 1°", rango: "89° - 91°", perPile: true, min: 89, max: 91 },
    { desc: "Revire del pilar (Cabeza)", ref: "90°", tol: "± 1.5°", rango: "88.5° - 91.5°", perPile: true, min: 88.5, max: 91.5 },
    { desc: "Alineación E/O de los pilares del seguidor", ref: "0", tol: "± 20", rango: "E/O", perPile: true, min: -20, max: 20 },
    { desc: "Alineación en altura de las cabezas de los pilares", ref: "0", tol: "± 20", rango: "Altura", perPile: true, min: -20, max: 20 },
    { desc: "Pendiente del seguidor N/S", ref: "≤ 4% / ≤ 8% / ≤ 15%", tol: "≤ 15%", rango: "asc / desc", perPile: false, isNumeric: true, min: -15, max: 15 },
    { desc: "Verticalidad de piruletas", ref: "90°", tol: "± 12.8°", rango: "77.2° - 102.8°", perPile: true, min: 77.2, max: 102.8 },
    { desc: "Verticalidad del soporte motor", ref: "90°", tol: "± 8°", rango: "82° - 98°", perPile: false, isNumeric: true, min: 82, max: 98 },
    { desc: "Rotación del soporte motor", ref: "90°", tol: "± 4°", rango: "86° - 94°", perPile: false, isNumeric: true, min: 86, max: 94 }
];

const pvhVerificacionesBifilaMotora = crearVerificaciones('MOTORA', [vAlt('IPE 140', []), vAlt('IPE 220', null, [4]), vAlt('CP170x70x20x4', []), vAlt('central HEA 140', [4])]);
const pvhVerificacionesBifilaGemela = crearVerificaciones('GEMELA', [vAlt('IPE 140', [4,5]), vAlt('IPE 220', null, [4,5]), vAlt('CP170x70x20x4', []), vAlt('central HEA 140', [])]);

const pvhVerificacionesRow34CentralMotora = crearVerificaciones('MOTORA', [vAlt('IPE 140', []), vAlt('IPE 160', []), vAlt('CP170x70x20x4', [1,2,3,4,5,7,8,9,10,11]), vAlt('central HEA 140', [6])]);
const pvhVerificacionesRow34CentralGemela = crearVerificaciones('GEMELA', [vAlt('IPE 140', [6,7]), vAlt('IPE 160', []), vAlt('CP170x70x20x4', [1,2,3,4,5,8,9,10,11,12]), vAlt('central HEA 140', [])]);

const pvhVerificacionesRow34P1NorthMotora = crearVerificaciones('MOTORA', [vAlt('IPE 140', []), vAlt('IPE 160', [1,2]), vAlt('CP170x70x20x4', [3,5,6]), vAlt('central HEA 140', [4])]);
const pvhVerificacionesRow34P1NorthGemela = crearVerificaciones('GEMELA', [vAlt('IPE 140', [4,5]), vAlt('IPE 160', [1,2]), vAlt('CP170x70x20x4', [3,6,7]), vAlt('central HEA 140', [])]);

const pvhVerificacionesRow34P1North120Motora = crearVerificaciones('MOTORA', [vAlt('IPE 140', []), vAlt('IPE 160', [1,2]), vAlt('CP170x70x20x4', [3,4,5,7,8,9,10,11]), vAlt('central HEA 140', [6])]);
const pvhVerificacionesRow34P1North120Gemela = crearVerificaciones('GEMELA', [vAlt('IPE 140', [6,7]), vAlt('IPE 160', [1,2]), vAlt('CP170x70x20x4', [3,4,5,8,9,10,11,12]), vAlt('central HEA 140', [])]);

const pvhVerificacionesRow34P1South60Motora = crearVerificaciones('MOTORA', [vAlt('IPE 140', []), vAlt('IPE 160', [5,6]), vAlt('CP170x70x20x4', [1,2,4]), vAlt('central HEA 140', [3])]);
const pvhVerificacionesRow34P1South60Gemela = crearVerificaciones('GEMELA', [vAlt('IPE 140', [3,4]), vAlt('IPE 160', [6,7]), vAlt('CP170x70x20x4', [1,2,5]), vAlt('central HEA 140', [])]);

const pvhVerificacionesRow34P1South120Motora = crearVerificaciones('MOTORA', [vAlt('IPE 140', []), vAlt('IPE 160', [10,11]), vAlt('CP170x70x20x4', [1,2,3,4,5,7,8,9]), vAlt('central HEA 140', [6])]);
const pvhVerificacionesRow34P1South120Gemela = crearVerificaciones('GEMELA', [vAlt('IPE 140', [6,7]), vAlt('IPE 160', [11,12]), vAlt('CP170x70x20x4', [1,2,3,4,5,8,9,10]), vAlt('central HEA 140', [])]);

const pvhVerificacionesRow34Perimeter2_120Motora = crearVerificaciones('MOTORA', [vAlt('IPE 140', []), vAlt('IPE 160', [1,2,10,11]), vAlt('CP170x70x20x4', [3,4,5,7,8,9]), vAlt('central HEA 140', [6])]);
const pvhVerificacionesRow34Perimeter2_120Gemela = crearVerificaciones('GEMELA', [vAlt('IPE 140', [6,7]), vAlt('IPE 160', [1,2,11,12]), vAlt('CP170x70x20x4', [3,4,5,8,9,10]), vAlt('central HEA 140', [])]);

const pvhVerificacionesRow56CentralMotora = crearVerificaciones('MOTORA', [vAlt('IPE 140', []), vAlt('IPE 160', []), vAlt('CP170x70x20x4', [1,2,3,4,6,7,8,9]), vAlt('central HEA 140', [5])]);
const pvhVerificacionesRow56CentralGemela = crearVerificaciones('GEMELA', [vAlt('IPE 140', [5,6]), vAlt('IPE 160', []), vAlt('CP170x70x20x4', [1,2,3,4,7,8,9,10]), vAlt('central HEA 140', [])]);

const pvhVerificacionesRow56P1North120Motora = crearVerificaciones('MOTORA', [vAlt('IPE 140', []), vAlt('IPE 160', [1,2]), vAlt('CP170x70x20x4', [3,4,5,7,8,9,10]), vAlt('central HEA 140', [6])]);
const pvhVerificacionesRow56P1North120Gemela = crearVerificaciones('GEMELA', [vAlt('IPE 140', [6,7]), vAlt('IPE 160', [1,2]), vAlt('CP170x70x20x4', [3,4,5,8,9,10,11]), vAlt('central HEA 140', [])]);

const pvhVerificacionesRow56P1South120Motora = crearVerificaciones('MOTORA', [vAlt('IPE 140', []), vAlt('IPE 160', [9,10]), vAlt('CP170x70x20x4', [1,2,3,4,6,7,8]), vAlt('central HEA 140', [5])]);
const pvhVerificacionesRow56P1South120Gemela = crearVerificaciones('GEMELA', [vAlt('IPE 140', [5,6]), vAlt('IPE 160', [10,11]), vAlt('CP170x70x20x4', [1,2,3,4,7,8,9]), vAlt('central HEA 140', [])]);

const crearVanos = (medidas) => medidas.map(nom => ({ nominal: nom, tolerancia: 20 }));

const v120mMotora = crearVanos([6100, 6800, 6800, 6800, 6800, 6600, 6800, 6800, 6800, 6100]);
const v120mGemela = crearVanos([6100, 6800, 6800, 6800, 6100, 700, 6600, 6800, 6800, 6800, 6100]);
const v60mNorthMotora = crearVanos([5000, 5500, 5500, 7800, 8000]);
const v60mNorthGemela = crearVanos([5000, 5500, 4800, 700, 7800, 8000]);
const v60mSouthMotora = crearVanos([8000, 8000, 5300, 5500, 5000]);
const v60mSouthGemela = crearVanos([8000, 7300, 700, 5300, 5500, 5000]);
const v60m1A1BMotora = crearVanos([5000, 5500, 5500, 5300, 5500, 5000]);
const v60m1A1BGemela = crearVanos([5000, 5500, 4800, 700, 5300, 5500, 5000]);

const v120mCentral56Motora = crearVanos([8200,8200,8200,8700,8500,8200,8200,8200]);
const v120mCentral56Gemela = crearVanos([8200,8200,8200,8000,700,8500,8200,8200,8200]);
const v120mNorth56Motora = crearVanos([6100,6800,6800,6800,6800,8500,8200,8200,8200]);
const v120mNorth56Gemela = crearVanos([6100,6800,6800,6800,6100,700,8500,8200,8200,8200]);
const v120mSouth56Motora = crearVanos([8200,8200,8200,8700,6600,6800,6800,6800,6100]);
const v120mSouth56Gemela = crearVanos([8200,8200,8200,8000,700,6600,6800,6800,6800,6100]);

const configVanosPVH = {
    "ROW 1-2 (MONOLINE 60M)": { "MONOFILA": { nominal: 0, tolerancia: 20, vanos: v120mMotora } },
    "ROW 1A-1B 60M (7P+8P)": { "MOTORA": { nominal: 0, tolerancia: 20, vanos: v60m1A1BMotora }, "GEMELA": { nominal: 0, tolerancia: 20, vanos: v60m1A1BGemela } },
    "ROW 3-4 CENTRAL 120M (11P+12P)": { "MOTORA": { nominal: 0, tolerancia: 20, vanos: v120mMotora }, "GEMELA": { nominal: 0, tolerancia: 20, vanos: v120mGemela } },
    "ROW 3-4 P1 NORTH 60M (6P+7P)": { "MOTORA": { nominal: 0, tolerancia: 20, vanos: v60mNorthMotora }, "GEMELA": { nominal: 0, tolerancia: 20, vanos: v60mNorthGemela } },
    "ROW 3-4 P1 NORTH 120M (11P+12P)": { "MOTORA": { nominal: 0, tolerancia: 20, vanos: v120mMotora }, "GEMELA": { nominal: 0, tolerancia: 20, vanos: v120mGemela } },
    "ROW 3-4 P1 SOUTH 60M (6P+7P)": { "MOTORA": { nominal: 0, tolerancia: 20, vanos: v60mSouthMotora }, "GEMELA": { nominal: 0, tolerancia: 20, vanos: v60mSouthGemela } },
    "ROW 3-4 P1 SOUTH 120M (11P+12P)": { "MOTORA": { nominal: 0, tolerancia: 20, vanos: v120mMotora }, "GEMELA": { nominal: 0, tolerancia: 20, vanos: v120mGemela } },
    "ROW 3-4 PERIMETER 2 120M (11P+12P)": { "MOTORA": { nominal: 0, tolerancia: 20, vanos: v120mMotora }, "GEMELA": { nominal: 0, tolerancia: 20, vanos: v120mGemela } },
    "ROW 5-6 CENTRAL 120M (9P+10P)": { "MOTORA": { nominal: 0, tolerancia: 20, vanos: v120mCentral56Motora }, "GEMELA": { nominal: 0, tolerancia: 20, vanos: v120mCentral56Gemela } },
    "ROW 5-6 P1 NORTH 60M (6P+7P)": { "MOTORA": { nominal: 0, tolerancia: 20, vanos: v60mNorthMotora }, "GEMELA": { nominal: 0, tolerancia: 20, vanos: v60mNorthGemela } },
    "ROW 5-6 PERIMETER 2 120M (11P+12P)": { "MOTORA": { nominal: 0, tolerancia: 20, vanos: v120mMotora }, "GEMELA": { nominal: 0, tolerancia: 20, vanos: v120mGemela } },
    "ROW 5-6 P1 NORTH 120M (10P+11P)": { "MOTORA": { nominal: 0, tolerancia: 20, vanos: v120mNorth56Motora }, "GEMELA": { nominal: 0, tolerancia: 20, vanos: v120mNorth56Gemela } },
    "ROW 5-6 P1 SOUTH 60M (6P+7P)": { "MOTORA": { nominal: 0, tolerancia: 20, vanos: v60mSouthMotora }, "GEMELA": { nominal: 0, tolerancia: 20, vanos: v60mSouthGemela } },
    "ROW 5-6 P1 SOUTH 120M (10P+11P)": { "MOTORA": { nominal: 0, tolerancia: 20, vanos: v120mSouth56Motora }, "GEMELA": { nominal: 0, tolerancia: 20, vanos: v120mSouth56Gemela } }
};

const crearChecklistBase = (tipo, verificaciones) => {
    const esGemela = tipo === 'GEMELA';
    const esMonoline = tipo === 'MONOFILA';
    const panelRail = (esGemela || esMonoline) ? pvhPanelMods : [...pvhPanelMods, "Sujeción de SBC"];
    const motorKey = esGemela ? "3. Transmisión (Gemela)" : "3. Sistema Motriz";
    const motorVal = esGemela ? pvhGemelaDrive : pvhMotoraDrive;
    const aprieteVal = esMonoline ? pvhParesApriete : (esGemela ? pvhParesAprieteBifilaGemela : pvhParesAprieteBifilaMotora);

    return {
        "1. Hincado": { subgrupos: { "1.1 Estado de las hincas": pvhBaseHincado } },
        "2. Estructura": { subgrupos: { "2.1 Post head (piruletas)": pvhBasePostHead, "2.2 Torque tubes": pvhBaseTorqueTube, "2.3 Panel rail": panelRail } },
        [motorKey]: motorVal,
        "4. Módulos": pvhModulos,
        "5. Pares de apriete": aprieteVal,
        "6. Verificaciones finales": verificaciones
    };
};

const checklistMecanica = {
    "ROW 1-2 (MONOLINE 60M)": { "MONOFILA": crearChecklistBase('MONOFILA', pvhVerificaciones) },
    "ROW 1A-1B 60M (7P+8P)": { "MOTORA": crearChecklistBase('MOTORA', pvhVerificacionesBifilaMotora), "GEMELA": crearChecklistBase('GEMELA', pvhVerificacionesBifilaGemela) },
    "ROW 3-4 CENTRAL 120M (11P+12P)": { "MOTORA": crearChecklistBase('MOTORA', pvhVerificacionesRow34CentralMotora), "GEMELA": crearChecklistBase('GEMELA', pvhVerificacionesRow34CentralGemela) },
    "ROW 3-4 P1 NORTH 60M (6P+7P)": { "MOTORA": crearChecklistBase('MOTORA', pvhVerificacionesRow34P1NorthMotora), "GEMELA": crearChecklistBase('GEMELA', pvhVerificacionesRow34P1NorthGemela) },
    "ROW 3-4 P1 NORTH 120M (11P+12P)": { "MOTORA": crearChecklistBase('MOTORA', pvhVerificacionesRow34P1North120Motora), "GEMELA": crearChecklistBase('GEMELA', pvhVerificacionesRow34P1North120Gemela) },
    "ROW 3-4 P1 SOUTH 60M (6P+7P)": { "MOTORA": crearChecklistBase('MOTORA', pvhVerificacionesRow34P1South60Motora), "GEMELA": crearChecklistBase('GEMELA', pvhVerificacionesRow34P1South60Gemela) },
    "ROW 3-4 P1 SOUTH 120M (11P+12P)": { "MOTORA": crearChecklistBase('MOTORA', pvhVerificacionesRow34P1South120Motora), "GEMELA": crearChecklistBase('GEMELA', pvhVerificacionesRow34P1South120Gemela) },
    "ROW 3-4 PERIMETER 2 120M (11P+12P)": { "MOTORA": crearChecklistBase('MOTORA', pvhVerificacionesRow34Perimeter2_120Motora), "GEMELA": crearChecklistBase('GEMELA', pvhVerificacionesRow34Perimeter2_120Gemela) },
    "ROW 5-6 CENTRAL 120M (9P+10P)": { "MOTORA": crearChecklistBase('MOTORA', pvhVerificacionesRow56CentralMotora), "GEMELA": crearChecklistBase('GEMELA', pvhVerificacionesRow56CentralGemela) },
    "ROW 5-6 P1 NORTH 60M (6P+7P)": { "MOTORA": crearChecklistBase('MOTORA', pvhVerificacionesRow34P1NorthMotora), "GEMELA": crearChecklistBase('GEMELA', pvhVerificacionesRow34P1NorthGemela) },
    "ROW 5-6 PERIMETER 2 120M (11P+12P)": { "MOTORA": crearChecklistBase('MOTORA', pvhVerificacionesRow34Perimeter2_120Motora), "GEMELA": crearChecklistBase('GEMELA', pvhVerificacionesRow34Perimeter2_120Gemela) },
    "ROW 5-6 P1 NORTH 120M (10P+11P)": { "MOTORA": crearChecklistBase('MOTORA', pvhVerificacionesRow56P1North120Motora), "GEMELA": crearChecklistBase('GEMELA', pvhVerificacionesRow56P1North120Gemela) },
    "ROW 5-6 P1 SOUTH 60M (6P+7P)": { "MOTORA": crearChecklistBase('MOTORA', pvhVerificacionesRow34P1South60Motora), "GEMELA": crearChecklistBase('GEMELA', pvhVerificacionesRow34P1South60Gemela) },
    "ROW 5-6 P1 SOUTH 120M (10P+11P)": { "MOTORA": crearChecklistBase('MOTORA', pvhVerificacionesRow56P1South120Motora), "GEMELA": crearChecklistBase('GEMELA', pvhVerificacionesRow56P1South120Gemela) }
};

const checklistCivil = { "Vallado": ["Alineaciones", "Materiales", "Replanteo", "Postes", "Malla", "Puerta"], "Drenajes": ["Check List Equipo", "Topografía", "Excavación", "Compactación", "Revestimiento", "Tubos", "Juntas"], "Caminos": ["Topografía", "Equipos", "CBR", "Vial", "Suelo", "Zahorra", "Tuberías"] };
const checklistElectrica = { "Apertura de zanjas tendido de cable": ["Profundidad", "Ancho", "Arena", "Cables", "Zanja"], "Tendido y conexionado de cable solar": ["UV", "Planos", "Embridado", "Etiquetado", "Conectores MC4"], "Montaje de combiner box": ["Localización", "Sujeción", "Fusibles", "Tornillos", "Limpieza"], "Conexionado cables MT": { "CABLEADO MT": ["Tendido", "Botella", "Celda", "Torque"], "EMPALME MT": ["Punta", "SRMS", "GPS"] } };