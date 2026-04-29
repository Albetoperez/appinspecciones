const { jsPDF } = window.jspdf;
localforage.config({ name: 'ElecnorApp_v24', storeName: 'inspecciones_db' });

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

let chartTendencia = null; // Variable global para guardar y destruir el gráfico de líneas

async function initApp() {
    const savedConfig = await localforage.getItem('config_pdf');
    if (savedConfig) {
        configGeneral = { ...configGeneral, ...savedConfig };
        if (!configGeneral.baselines || !configGeneral.baselines["CIV-Vallado"]) {
            configGeneral.baselines = { "MEC": [0,0,0,0,0], "CIV-Vallado": [0,0,0,0,0], "CIV-Drenajes": [0,0,0,0,0], "CIV-Caminos": [0,0,0,0,0], "ELE-Zanjas": [0,0,0,0,0], "ELE-Cables": [0,0,0,0,0], "ELE-CB": [0,0,0,0,0], "ELE-MT": [0,0,0,0,0] };
        }
        if(configGeneral.logo) { document.querySelectorAll('.img-logo-elecnor').forEach(img => { img.src = configGeneral.logo; img.style.display = 'block'; }); }
    }
    irInicio(); renderListado(); initAnotacion(); 
}

function abrirAjustes() {
    document.getElementById('conf-proyecto').value = configGeneral.proyecto || "";
    document.getElementById('conf-cliente').value = configGeneral.cliente || "";
    Object.keys(subMap).forEach(key => {
        const bdKey = subMap[key];
        if (!configGeneral.baselines[bdKey]) configGeneral.baselines[bdKey] = [0,0,0,0,0];
        for(let i=0; i<5; i++) {
            const inputEl = document.getElementById(`b-${bdKey}-${i}`);
            if(inputEl) inputEl.value = configGeneral.baselines[bdKey][i] || 0;
        }
    });
    if(configGeneral.logo) { document.getElementById('conf-logo-preview').src = configGeneral.logo; document.getElementById('conf-logo-preview').style.display = 'inline-block'; }
    document.getElementById('modalAjustes').style.display = 'flex';
}

function cargarLogoAjustes(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('conf-logo-preview');
            preview.src = e.target.result;
            preview.style.display = 'inline-block';
        };
        reader.readAsDataURL(input.files[0]);
    }
}

async function guardarAjustes() {
    configGeneral.proyecto = document.getElementById('conf-proyecto').value;
    configGeneral.cliente = document.getElementById('conf-cliente').value;
    Object.keys(subMap).forEach(key => {
        const bdKey = subMap[key];
        for(let i=0; i<5; i++) {
            const inputEl = document.getElementById(`b-${bdKey}-${i}`);
            if(inputEl) configGeneral.baselines[bdKey][i] = parseInt(inputEl.value) || 0;
        }
    });
    const preview = document.getElementById('conf-logo-preview');
    if(preview.src && preview.src.startsWith('data:image')) configGeneral.logo = preview.src;
    await localforage.setItem('config_pdf', configGeneral);
    document.getElementById('modalAjustes').style.display = 'none';
}

function abrirAuthDashboard() { document.getElementById('input-pin').value = ''; document.getElementById('modalAuth').style.display = 'flex'; }
function verificarPin() { 
    if (document.getElementById('input-pin').value === "2013") { 
        document.getElementById('modalAuth').style.display = 'none'; 
        renderDashboard(); 
    } else alert("PIN Incorrecto."); 
}

function cambiarPestanaDash(tab) {
    if(tab === 'prod') {
        document.getElementById('tab-prod').style.display = 'block';
        document.getElementById('tab-cal').style.display = 'none';
        document.getElementById('btn-tab-prod').style.background = 'var(--elecnor-blue)';
        document.getElementById('btn-tab-prod').style.color = 'white';
        document.getElementById('btn-tab-cal').style.background = '#ddd';
        document.getElementById('btn-tab-cal').style.color = '#555';
    } else {
        document.getElementById('tab-prod').style.display = 'none';
        document.getElementById('tab-cal').style.display = 'block';
        document.getElementById('btn-tab-cal').style.background = 'var(--elecnor-blue)';
        document.getElementById('btn-tab-cal').style.color = 'white';
        document.getElementById('btn-tab-prod').style.background = '#ddd';
        document.getElementById('btn-tab-prod').style.color = '#555';
    }
}

async function renderDashboard() {
    document.getElementById('portada').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'block';

    const today = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('dash-fecha').innerText = today;

    // Filtros
    const fZona = document.getElementById('dash-filtro-zona').value;
    const fDisc = document.getElementById('dash-filtro-disc').value;
    const fDesde = document.getElementById('dash-filtro-desde').value;
    const fHasta = document.getElementById('dash-filtro-hasta').value;

    const dataObj = await localforage.getItem('inspecciones_data') || {};
    let allReports = Object.values(dataObj);

    // Aplicar filtros
    allReports = allReports.filter(ins => {
        if (fZona !== 'TODOS' && ins.zona !== fZona) return false;
        if (fDisc !== 'TODOS' && ins.disciplina !== fDisc) return false;
        if (fDesde && ins.fecha < fDesde) return false;
        if (fHasta && ins.fecha > fHasta) return false;
        return true;
    });

    const uniqueEquip = {};
    allReports.forEach(ins => {
        const baseId = ins.id.split('-R')[0]; 
        const sub = ins.subDisciplina || "MEC";
        const uniqueKey = `${ins.disciplina}-${sub}-${baseId}`; 
        const rev = ins.revision || 0;
        if (!uniqueEquip[uniqueKey] || rev >= (uniqueEquip[uniqueKey].revision || 0)) {
            uniqueEquip[uniqueKey] = ins; 
        }
    });
    const uniqueList = Object.values(uniqueEquip);

    let stOk = 0, stNok = 0, stInc = 0;
    const supervisorCounts = {};
    
    // Contadores de defectos por disciplina (Top Defectos separados)
    const defectMEC = {};
    const defectCIV = {};
    const defectELE = {};

    uniqueList.forEach(ins => {
        let hasPend = false, hasNok = false;
        if (ins.checklist) {
            ins.checklist.forEach(c => {
                if (c.estado === 'PENDIENTE') hasPend = true;
                if (c.estado === 'NOK') {
                    hasNok = true;
                    let defKey = `${c.bloque} - ${c.titulo.replace(/^Poste \d+ - |^Vano \d+-\d+: /,"")}`;
                    if(ins.disciplina === 'MEC') defectMEC[defKey] = (defectMEC[defKey] || 0) + 1;
                    if(ins.disciplina === 'CIV') defectCIV[defKey] = (defectCIV[defKey] || 0) + 1;
                    if(ins.disciplina === 'ELE') defectELE[defKey] = (defectELE[defKey] || 0) + 1;
                }
            });
        }
        if (hasPend) stInc++; else if (hasNok) stNok++; else stOk++;
        if (ins.supervisor) supervisorCounts[ins.supervisor] = (supervisorCounts[ins.supervisor] || 0) + 1;
    });

    // Actualizar KPIs superiores
    document.getElementById('kpi-ok').innerText = stOk;
    document.getElementById('kpi-nok-active').innerText = stNok;
    document.getElementById('kpi-inc').innerText = stInc;
    document.getElementById('kpi-quality').innerText = uniqueList.length > 0 ? (allReports.length / uniqueList.length).toFixed(2) : "0.0";

    // PESTAÑA CALIDAD: Gráfico Salud (Pie)
    const totalU = uniqueList.length;
    const degOk = totalU > 0 ? (stOk / totalU) * 360 : 0;
    const degNok = totalU > 0 ? (stNok / totalU) * 360 : 0;
    document.getElementById('dash-pie').style.background = `conic-gradient(var(--success-green) 0deg ${degOk}deg, var(--danger-red) ${degOk}deg ${degOk + degNok}deg, #6c757d ${degOk + degNok}deg 360deg)`;
    document.getElementById('leg-ok').innerText = totalU > 0 ? Math.round((stOk/totalU)*100) + '%' : '0%';
    document.getElementById('leg-nok').innerText = totalU > 0 ? Math.round((stNok/totalU)*100) + '%' : '0%';
    document.getElementById('leg-inc').innerText = totalU > 0 ? Math.round((stInc/totalU)*100) + '%' : '0%';

    // PESTAÑA CALIDAD: Tops Defectos por Disciplina y Supervisores
    renderTopBars('dash-top-def-mec', defectMEC, 'var(--danger-red)');
    renderTopBars('dash-top-def-civ', defectCIV, 'var(--warning-orange)');
    renderTopBars('dash-top-def-ele', defectELE, '#9c27b0'); // Color distinto para eléctrica
    renderTopBars('dash-bar-sup', supervisorCounts, 'var(--elecnor-blue)');

    // PESTAÑA PRODUCCIÓN: Tabla Alcance / Avance %
    const mapZonas = {"ARCO1":0, "ARCO2":1, "ARCO3":2, "ARCO4":3, "ARCO5":4};
    const zonasLabels = ["ARCO1", "ARCO2", "ARCO3", "ARCO4", "ARCO5"];
    let indicesBaselines = fZona === 'TODOS' ? [0,1,2,3,4] : [mapZonas[fZona]];
    let totalMetaGlobal = 0, totalOkGlobal = 0;
    let tbodyAlcance = '';
    
    // Arrays para guardar el avance % por cada Zona (Para pintar las barras de progreso por zona)
    const avancePorZona = [0,0,0,0,0];

    const subMapInv = { "MEC": "MEC", "CIV-Vallado": "Vallado", "CIV-Drenajes": "Drenajes", "CIV-Caminos": "Caminos", "ELE-Zanjas": "Apertura de zanjas tendido de cable", "ELE-Cables": "Tendido y conexionado de cable solar", "ELE-CB": "Montaje de combiner box", "ELE-MT": "Conexionado cables MT" };

    Object.keys(configGeneral.baselines).forEach(bdKey => {
        const discPrefix = bdKey.split('-')[0];
        if (fDisc !== 'TODOS' && discPrefix !== fDisc) return;

        let totalObj = 0;
        indicesBaselines.forEach(idx => { totalObj += configGeneral.baselines[bdKey][idx] || 0; });

        let compOk = 0;
        const subNameStr = subMapInv[bdKey];
        uniqueList.forEach(ins => {
            if ((bdKey === 'MEC' && ins.disciplina === 'MEC') || (ins.disciplina === discPrefix && ins.subDisciplina === subNameStr)) {
                if (!ins.checklist.some(c => c.estado === 'NOK' || c.estado === 'PENDIENTE')) compOk++;
            }
        });

        const pct = totalObj > 0 ? (compOk / totalObj * 100).toFixed(2) : "0.00";
        const pend = totalObj > compOk ? totalObj - compOk : 0;
        totalMetaGlobal += totalObj; totalOkGlobal += compOk;

        if (totalObj > 0 || compOk > 0) {
            tbodyAlcance += `<tr>
                <td><strong>${bdKey}</strong></td>
                <td>${totalObj}</td>
                <td style="color:var(--success-green); font-weight:bold;">${compOk}</td>
                <td style="color:var(--warning-orange);">${pend}</td>
                <td><div style="background:#eee; border-radius:4px; width:100%; height:16px; position:relative; overflow:hidden;">
                    <div style="background:var(--elecnor-blue); height:100%; width:${pct}%;"></div>
                    <span style="position:absolute; top:0; left:50%; transform:translateX(-50%); font-size:10px; color:${pct>50?'white':'#333'}; line-height:16px; font-weight:bold;">${pct}%</span>
                </div></td>
            </tr>`;
        }
    });

    document.querySelector('#dash-tabla-alcance tbody').innerHTML = tbodyAlcance || '<tr><td colspan="5" style="text-align:center;">Configura los Totales en Ajustes ⚙️</td></tr>';

    const pctGlobal = totalMetaGlobal > 0 ? (totalOkGlobal / totalMetaGlobal * 100).toFixed(2) : "0.00";
    document.getElementById('kpi-real-prog').innerText = pctGlobal + '%';
    document.getElementById('fill-real-prog').style.width = pctGlobal + '%';

    // PESTAÑA PRODUCCIÓN: Calcular avance por zonas individualmente para las barras
    let zonasHtml = '';
    for(let z=0; z<5; z++) {
        let metaZ = 0, okZ = 0;
        Object.keys(configGeneral.baselines).forEach(bdKey => {
            if (fDisc === 'TODOS' || bdKey.startsWith(fDisc)) metaZ += configGeneral.baselines[bdKey][z] || 0;
        });
        uniqueList.forEach(ins => {
            if(ins.zona === zonasLabels[z]) {
                if (fDisc === 'TODOS' || ins.disciplina === fDisc) {
                    if (!ins.checklist.some(c => c.estado === 'NOK' || c.estado === 'PENDIENTE')) okZ++;
                }
            }
        });
        const pZ = metaZ > 0 ? Math.round((okZ/metaZ)*100) : 0;
        const colorZ = pZ < 20 ? 'var(--danger-red)' : (pZ < 80 ? 'var(--warning-orange)' : 'var(--success-green)');
        zonasHtml += `
        <div style="margin-bottom: 12px;">
            <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:bold; color:#555; margin-bottom:4px;">
                <span>${zonasLabels[z]}</span><span>${pZ}%</span>
            </div>
            <div style="background:#e9ecef; height:14px; border-radius:6px; overflow:hidden; border: 1px solid #ddd;">
                <div style="height:100%; width:${pZ}%; background:${colorZ}; transition:width 1s ease-out;"></div>
            </div>
        </div>`;
    }
    document.getElementById('dash-zonas-progreso').innerHTML = zonasHtml;

    // PESTAÑA PRODUCCIÓN: Gráfico de Tendencia (Chart.js) últimos 30 días
    const countsByDate = {};
    for(let i=29; i>=0; i--) {
        let d = new Date(); 
        d.setDate(d.getDate() - i);
        countsByDate[d.toISOString().split('T')[0]] = 0;
    }
    
    uniqueList.forEach(ins => {
        const isOk = !ins.checklist.some(c => c.estado === 'NOK' || c.estado === 'PENDIENTE');
        if(isOk && countsByDate[ins.fecha] !== undefined) {
            countsByDate[ins.fecha]++;
        }
    });

    const trendLabels = Object.keys(countsByDate).map(d => {
        const parts = d.split('-'); return `${parts[2]}/${parts[1]}`; // Formato DD/MM
    });
    const trendData = Object.values(countsByDate);

    if (chartTendencia) chartTendencia.destroy();
    const ctx = document.getElementById('chart-tendencia').getContext('2d');
    chartTendencia = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trendLabels,
            datasets: [{
                label: 'Equipos OK / Día',
                data: trendData,
                borderColor: '#005596',
                backgroundColor: 'rgba(0, 85, 150, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointRadius: 2,
                pointBackgroundColor: '#28a745'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
            plugins: { legend: { display: false } }
        }
    });
}

function renderTopBars(containerId, dataMap, color) {
    const sorted = Object.entries(dataMap).sort((a,b) => b[1]-a[1]).slice(0,5);
    let html = sorted.length ? '' : '<p style="text-align:center; color:#999; margin-top:20px; font-size:12px;">Sin defectos registrados.</p>';
    if(sorted.length) {
        const max = sorted[0][1];
        sorted.forEach(item => {
            const pct = (item[1]/max*100);
            html += `<div class="bar-row" style="margin-bottom:8px;"><div class="bar-label" style="font-size:10px; width:120px;" title="${item[0]}">${item[0]}</div><div class="bar-track" style="height:12px; margin:0 10px;"><div class="bar-fill" style="width:${pct}%; background:${color};"></div></div><div class="bar-val" style="font-size:10px;">${item[1]}</div></div>`;
        });
    }
    document.getElementById(containerId).innerHTML = html;
}

function irInicio() { document.getElementById('checklist').style.display='none'; document.getElementById('listado').style.display='none'; document.getElementById('dashboard-view').style.display='none'; document.getElementById('portada').style.display='flex'; }
function mostrarHistorial() { document.getElementById('portada').style.display='none'; document.getElementById('dashboard-view').style.display='none'; document.getElementById('listado').style.display='block'; renderListado(); }
function obtenerGPS() { if (navigator.geolocation) { document.getElementById('ins-gps').value = "Calculando..."; navigator.geolocation.getCurrentPosition((pos) => { document.getElementById('ins-gps').value = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`; }, (err) => { document.getElementById('ins-gps').value = ""; }); } }
const pads = {};
function initPads() { ['pad-supervisor', 'pad-propiedad'].forEach(id => { const canvas = document.getElementById(id); const ctx = canvas.getContext('2d'); let drawing = false; canvas.width = canvas.parentElement.clientWidth; canvas.height = 150; ctx.lineWidth = 2; const getX = (e) => (e.touches ? e.touches[0].clientX : e.clientX) - canvas.getBoundingClientRect().left; const getY = (e) => (e.touches ? e.touches[0].clientY : e.clientY) - canvas.getBoundingClientRect().top; canvas.addEventListener('mousedown', (e) => { drawing=true; ctx.beginPath(); ctx.moveTo(getX(e), getY(e)); }); canvas.addEventListener('mousemove', (e) => { if(!drawing) return; ctx.lineTo(getX(e), getY(e)); ctx.stroke(); }); window.addEventListener('mouseup', () => drawing=false); pads[id] = { canvas, ctx }; }); }
function clearSig(id) { pads[id].ctx.clearRect(0,0,pads[id].canvas.width,pads[id].canvas.height); pads[id].ctx.beginPath(); }

function actualizarProgreso() {
    const total = document.querySelectorAll('.inspeccion-item').length;
    const okRadio = document.querySelectorAll('input[value="ok"]:checked').length;
    const nokRadio = document.querySelectorAll('input[value="nok"]:checked').length;
    const naRadio = document.querySelectorAll('input[value="na"]:checked').length;
    
    const selects = Array.from(document.querySelectorAll('select.select-estado'));
    const okSelect = selects.filter(s => s.value === 'ok').length;
    const nokSelect = selects.filter(s => s.value === 'nok').length;
    const naSelect = selects.filter(s => s.value === 'na').length;

    const autoNas = selects.filter(s => s.style.display === 'none' && s.value === 'na').length;

    const ok = okRadio + okSelect;
    const nok = nokRadio + nokSelect;
    const naEfectivo = (naRadio + naSelect) - autoNas;
    const totalEfectivo = total - autoNas;

    const res = ok + nok + naEfectivo;
    const porc = totalEfectivo > 0 ? Math.round((res / totalEfectivo) * 100) : 0;
    
    document.getElementById('progreso-bar').style.width = porc + "%";
    document.getElementById('txt-progreso').innerText = porc + "% Completado";
    document.getElementById('res-ok').innerText = ok;
    document.getElementById('res-nok').innerText = nok;
    document.getElementById('res-inc').innerText = totalEfectivo - res;
}

function cambioDisciplinaMecanica() {
    const modelo = document.getElementById('ins-modelo-mec').value;
    const filaSelect = document.getElementById('ins-fila-mec');
    if(modelo.includes('MONOLINE')) {
        filaSelect.value = 'MONOFILA';
        for(let option of filaSelect.options) option.disabled = option.value !== 'MONOFILA';
    } else {
        if(filaSelect.value === 'MONOFILA') filaSelect.value = 'MOTORA';
        for(let option of filaSelect.options) option.disabled = option.value === 'MONOFILA';
    }
    cambioDisciplina();
}

function cambioZona() {
    actualizarID();
    if (document.getElementById('ins-disciplina').value === 'MEC') {
        cargarChecklist(extraerDatosActuales());
    }
}

function cambioDisciplina() { 
    actualizarEtiquetasEquipo(); 
    if (document.getElementById('ins-disciplina').value === 'MEC') {
        const modelo = document.getElementById('ins-modelo-mec').value;
        const fila = document.getElementById('ins-fila-mec').value;
        const numPostesInput = document.getElementById('ins-num-postes');
        const matchDuo = modelo.match(/\((\d+)P\+(\d+)P\)/i);
        if (matchDuo) numPostesInput.value = (fila === 'MOTORA') ? matchDuo[1] : matchDuo[2];
        else if (modelo.includes('MONOLINE 60M')) numPostesInput.value = 11;
    }
    actualizarID(); 
    cargarChecklist(); 
}

function actualizarEtiquetasEquipo() { 
    const d = document.getElementById('ins-disciplina').value; 
    document.getElementById('div-sub-civil').style.display = d==='CIV'?'flex':'none'; 
    document.getElementById('div-sub-ele').style.display = d==='ELE'?'flex':'none'; 
    document.getElementById('div-sub-mec').style.display = d==='MEC'?'block':'none';
    if(d === 'MEC') {
        const fila = document.getElementById('ins-fila-mec').value;
        document.getElementById('lbl-equipo').innerText = `Tracker (${fila === 'MOTORA' ? 'Mot.' : (fila === 'GEMELA' ? 'Gem.' : 'Mono')})`;
    } else document.getElementById('lbl-equipo').innerText = (d==='CIV'?'Equipo':'Circuito');
}

function actualizarID() { 
    const rev = parseInt(document.getElementById('ins-revision').value) || 0; 
    const d = document.getElementById('ins-disciplina').value;
    let cod = `${d}-${document.getElementById('ins-zona').value}-${(document.getElementById('ins-equipo').value || 'EQ').toUpperCase()}`; 
    if(d === 'MEC') {
        const filaStr = document.getElementById('ins-fila-mec').value;
        cod += `-${filaStr === 'MONOFILA' ? 'MONO' : filaStr.substring(0,3)}`;
    }
    const final = rev > 0 ? `${cod}-R${rev}` : cod; 
    document.getElementById('id-generado').innerText = final; 
    return final; 
}

function toggleBloque(id) { 
    const el = document.getElementById(id);
    if(el) el.style.display = el.style.display === 'block' ? 'none' : 'block'; 
}

function marcarTodoOk(b) { 
    const bId = 'bloque-' + b.replace(/[.\s]+/g, '');
    const cont = document.getElementById(bId);
    if(cont) {
        cont.querySelectorAll('input[value="ok"]').forEach(i => i.checked = true);
        cont.querySelectorAll('select.select-estado:not([data-auto="true"])').forEach(s => {
            if (s.value === 'na') return;
            s.value = 'ok';
            s.className = 'select-estado ok';
        });
        actualizarProgreso();
    }
}

function evaluarVano(idx) {
    const nom = parseFloat(document.getElementById('nom-'+idx).value) || 0;
    const tol = parseFloat(document.getElementById('tol-'+idx).value) || 0;
    const realInput = document.getElementById('real-'+idx);
    const realStr = realInput.value;
    const selObj = document.getElementById('sel-'+idx);

    if(!realStr.trim()) {
        selObj.value = 'PENDIENTE';
        selObj.className = 'select-estado';
    } else {
        const real = parseFloat(realStr);
        const diff = Math.abs(real - nom);
        
        if(diff <= tol) {
            selObj.value = 'ok';
            selObj.className = 'select-estado ok';
        } else {
            selObj.value = 'nok';
            selObj.className = 'select-estado nok';
        }
    }
    actualizarProgreso();

    if (realInput) {
        const tbody = realInput.closest('tbody');
        if (tbody) {
            let sumaReal = 0;
            const rows = tbody.querySelectorAll('tr.inspeccion-item');
            rows.forEach(tr => {
                const input = tr.querySelector('input[type="number"]');
                const tdAcumulado = tr.querySelector('.td-acumulado');
                const teorico = tr.getAttribute('data-acum-teorico');

                if (input && input.value) {
                    sumaReal += parseFloat(input.value) || 0;
                    if (tdAcumulado && teorico) {
                        tdAcumulado.innerHTML = `<span style="color:var(--elecnor-blue)">${parseFloat(sumaReal.toFixed(2))}</span> <span style="color:#999">/ ${teorico}</span>`;
                    }
                } else {
                    if (tdAcumulado && teorico) {
                        tdAcumulado.innerHTML = `<span style="color:#ccc">-</span> <span style="color:#999">/ ${teorico}</span>`;
                    }
                }
            });
        }
    }
}

function evaluarVerifNum(idx, min, max) {
    const input = document.getElementById('real-verif-'+idx);
    const selObj = document.getElementById('sel-'+idx);
    const val = parseFloat(input.value);

    if(isNaN(val)) {
        selObj.value = 'PENDIENTE';
        selObj.className = 'select-estado';
        input.style.borderColor = '#ccc';
        input.style.color = '#333';
    } else {
        if (val >= min && val <= max) {
            selObj.value = 'ok';
            selObj.className = 'select-estado ok';
            input.style.borderColor = 'var(--success-green)';
            input.style.color = 'var(--success-green)';
        } else {
            selObj.value = 'nok';
            selObj.className = 'select-estado nok';
            input.style.borderColor = 'var(--danger-red)';
            input.style.color = 'var(--danger-red)';
        }
    }
    actualizarProgreso();
}

function cargarChecklist(datosExistentes = null, esSubsanacion = false) {
    const contenedor = document.getElementById('contenedor-bloques'); 
    contenedor.innerHTML = ''; 
    let contador = 0;
    const disciplina = document.getElementById('ins-disciplina').value; 
    let estructura = {};

    if (disciplina === 'CIV') {
        const sub = document.getElementById('ins-sub-civil').value;
        if(checklistCivil[sub]) estructura = {"1. Inspección General": checklistCivil[sub]};
    }
    else if (disciplina === 'ELE') {
        const sub = document.getElementById('ins-sub-ele').value;
        estructura = Array.isArray(checklistElectrica[sub]) ? {"1. Inspección General": checklistElectrica[sub]} : checklistElectrica[sub];
    } else if (disciplina === 'MEC') {
        const mod = document.getElementById('ins-modelo-mec').value;
        const fila = document.getElementById('ins-fila-mec').value;
        if(checklistMecanica[mod] && checklistMecanica[mod][fila]) {
            const raw = JSON.parse(JSON.stringify(checklistMecanica[mod][fila]));
            const numPostes = parseInt(document.getElementById('ins-num-postes').value) || 0;
            const isLegacy = datosExistentes && datosExistentes.some(d => d.bloque === "1. Postes - Hincado" && !d.titulo.startsWith("Poste "));
            
            const finalMec = {};
            for(let key in raw) {
                if (raw[key].subgrupos) {
                    finalMec[key] = { subgrupos: {} };
                    for (let subKey in raw[key].subgrupos) {
                        if (subKey === "1.1 Estado de las hincas" && !isLegacy) {
                            finalMec[key].subgrupos[subKey] = { isTable: true, items: raw[key].subgrupos[subKey], postes: numPostes };
                            if (numPostes > 1) {
                                finalMec[key].subgrupos["1.2 Distancias entre hincas"] = { isVanosTable: true, postes: numPostes };
                            }
                        } else if (subKey === "2.1 Post head (piruletas)" && !isLegacy) {
                            finalMec[key].subgrupos[subKey] = { isTable: true, items: raw[key].subgrupos[subKey], postes: numPostes };
                        } else {
                            finalMec[key].subgrupos[subKey] = raw[key].subgrupos[subKey];
                        }
                    }
                } else if (key === "5. Pares de apriete" && !isLegacy) {
                    finalMec[key] = { isTorqueTable: true, items: raw[key], postes: numPostes };
                } else if (key === "6. Verificaciones finales" && !isLegacy) {
                    const processedItems = raw[key].map(item => {
                        if (item.dynamicRef === "pitch") {
                            const zona = document.getElementById('ins-zona').value;
                            const nom = (zona === 'ARCO4') ? 5800 : 6000;
                            return {
                                ...item,
                                ref: nom.toString(),
                                rango: `${nom - 20} - ${nom + 20}`,
                                min: nom - 20,
                                max: nom + 20
                            };
                        }
                        return item;
                    });
                    finalMec[key] = { isVerificacionesTable: true, items: processedItems, postes: numPostes };
                } else {
                    finalMec[key] = raw[key];
                }
            }
            estructura = finalMec;
        }
    }

    for (const bloquePrincipal in estructura) {
        let itemsHTML = '';

        const procesarSeccion = (bloqueLogico, dataObj) => {
            let html = '';
            
            if (dataObj && dataObj.isTable) {
                const numPostes = dataObj.postes;
                const itemsHincado = dataObj.items;
                
                html += `<div class="table-responsive" style="margin: 0; padding: 0;"><table class="table-hincado">`;
                html += `<thead><tr><th class="item-desc" style="z-index: 3;">Ítem a verificar</th>`;
                for(let p=1; p<=numPostes; p++) html += `<th>P ${p}</th>`;
                html += `</tr></thead><tbody>`;

                itemsHincado.forEach((itemDesc, rowIdx) => {
                    const sharedObsId = `shared-obs-${bloqueLogico.replace(/\s/g,'')}-${rowIdx}`;
                    const sharedImgId = `shared-img-${bloqueLogico.replace(/\s/g,'')}-${rowIdx}`;
                    const sharedFileId = `shared-file-${bloqueLogico.replace(/\s/g,'')}-${rowIdx}`;
                    
                    let firstObs = '';
                    let firstFoto = '';

                    html += `<tr><td class="item-desc">${itemDesc}</td>`;
                    for(let p=1; p<=numPostes; p++) {
                        const desc = `Poste ${p} - ${itemDesc}`;
                        let resp = {estado: 'PENDIENTE', obs: '', foto: ''};
                        if(datosExistentes) {
                            const f = datosExistentes.find(d => d.bloque === bloqueLogico && d.titulo === desc);
                            if(f) {
                                resp = f;
                                if(!firstObs && f.obs) firstObs = f.obs;
                                if(!firstFoto && f.foto) firstFoto = f.foto;
                            }
                        }

                        const selColorClass = resp.estado !== 'PENDIENTE' ? resp.estado.toLowerCase() : '';

                        html += `<td style="padding: 2px;">
                            <div class="inspeccion-item" data-bloque="${bloqueLogico}" data-desc="${desc}" data-shared-obs="${sharedObsId}" data-shared-img="${sharedImgId}" style="border:none; padding:0;">
                                <select class="select-estado ${selColorClass}" onchange="this.className='select-estado '+this.value.toLowerCase(); actualizarProgreso();">
                                    <option value="PENDIENTE" ${resp.estado==='PENDIENTE'?'selected':''} hidden>-</option>
                                    <option value="ok" ${resp.estado==='OK'?'selected':''}>OK</option>
                                    <option value="nok" ${resp.estado==='NOK'?'selected':''}>NOK</option>
                                    <option value="na" ${resp.estado==='NA'?'selected':''}>N/A</option>
                                </select>
                            </div>
                        </td>`;
                        contador++; 
                    }
                    html += `</tr>`;
                    
                    html += `<tr class="row-obs">
                        <td colspan="${numPostes + 1}" style="text-align: left; padding: 6px;">
                            <div style="display:flex; gap: 8px; align-items:center;">
                                <span style="font-size:10px; font-weight:bold; color:#555; white-space:nowrap;">📋 Obs. Global:</span>
                                <textarea id="${sharedObsId}" placeholder="Anotar observaciones que apliquen a todos los pilares de este ítem...">${firstObs}</textarea>
                                <div style="flex-shrink:0;">
                                    <input type="file" accept="image/*" style="display:none;" id="${sharedFileId}" onchange="procesarFotoParaAnotar(this, '${sharedImgId}')">
                                    <button type="button" onclick="document.getElementById('${sharedFileId}').click()" style="font-size: 14px; padding: 4px 10px; background: #e2eaf0; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; color:var(--elecnor-blue); font-weight:bold; display:flex; align-items:center; height:32px;">📸 FOTO</button>
                                </div>
                            </div>
                            <img src="${firstFoto}" class="foto-preview" id="${sharedImgId}" style="display:${firstFoto?'block':'none'}; max-height:80px; width:auto; margin-top:5px; border:1px solid #ccc; cursor:pointer;" onclick="verGrande(this.src)">
                        </td>
                    </tr>`;
                });
                html += `</tbody></table></div>`;

            } else if (dataObj && dataObj.isVanosTable) {
                const numPostes = dataObj.postes;
                const mod = document.getElementById('ins-modelo-mec').value;
                const fila = document.getElementById('ins-fila-mec').value;

                html += `<div class="table-responsive" style="margin: 0; padding: 0;">
                    <table class="table-hincado" style="min-width: 100%;">
                        <thead>
                            <tr>
                                <th style="z-index: 1; width: 90px; font-size: 9px; padding: 4px;">DISTANCIAS ENTRE PILARES</th>
                                <th style="width: 50px; font-size: 9px; padding: 4px;">NOM.<br>(mm)</th>
                                <th style="width: 45px; font-size: 9px; padding: 4px;">TOL.<br>(mm)</th>
                                <th style="width: 80px; font-size: 9px; padding: 4px;">MEDIDA<br>REAL (mm)</th>
                                <th style="width: 60px; font-size: 9px; padding: 4px;">ESTADO</th>
                                <th style="width: 100px; font-size: 9px; padding: 4px;">ACUMULADO<br>Real / Teórico (mm)</th>
                            </tr>
                        </thead>
                        <tbody>`;

                let acumulado = 0;
                let acumuladoReal = 0;
                const sharedObsId = `shared-obs-vanos`;
                const sharedImgId = `shared-img-vanos`;
                const sharedFileId = `shared-file-vanos`;
                let firstObs = '';
                let firstFoto = '';

                for(let p=1; p<numPostes; p++) {
                    const desc = `Vano ${p}-${p+1}: Medición de distancia`;
                    const vIdx = p - 1;

                    let nom = 0, tol = 20;
                    if(configVanosPVH[mod] && configVanosPVH[mod][fila] && configVanosPVH[mod][fila].vanos && configVanosPVH[mod][fila].vanos[vIdx]) {
                        nom = configVanosPVH[mod][fila].vanos[vIdx].nominal;
                        tol = configVanosPVH[mod][fila].vanos[vIdx].tolerancia;
                    } else if(configVanosPVH[mod] && configVanosPVH[mod][fila]) {
                        nom = configVanosPVH[mod][fila].nominal || 0;
                        tol = configVanosPVH[mod][fila].tolerancia || 20;
                    }

                    acumulado += nom;

                    let resp = {estado: 'PENDIENTE', obs: '', foto: ''};
                    if(datosExistentes) {
                        const f = datosExistentes.find(d => d.bloque === bloqueLogico && d.titulo === desc);
                        if(f) {
                            resp = f;
                            const rMatch = f.obs.match(/Medida Real: ([\d.]+) mm \| (.*)/);
                            if(rMatch) {
                                if(!firstObs && rMatch[2]) firstObs = rMatch[2];
                            } else {
                                if(!firstObs && !f.obs.includes("Medida Real:")) firstObs = f.obs;
                            }
                        }
                    }

                    let realVal = '';
                    if(resp.obs) {
                        const rMatch = resp.obs.match(/Medida Real: ([\d.]+)/);
                        if(rMatch) realVal = rMatch[1];
                    }

                    if (realVal) {
                        acumuladoReal += parseFloat(realVal);
                    }

                    const selColorClass = resp.estado !== 'PENDIENTE' ? resp.estado.toLowerCase() : '';

                    html += `<tr class="inspeccion-item" data-bloque="${bloqueLogico}" data-desc="${desc}" data-shared-obs="${sharedObsId}" data-shared-img="${sharedImgId}" data-acum-teorico="${acumulado}" style="display: table-row !important; border-bottom:1px solid #ccc;">
                        <td class="item-desc" style="text-align:center; font-size:9px; white-space:normal; padding:2px;">Vano ${p} - ${p+1}</td>
                        <td style="padding:4px;text-align:center;">${nom}</td>
                        <td style="padding:4px;text-align:center;">± ${tol}</td>
                        <td style="padding:4px;text-align:center;">
                            <input type="hidden" id="nom-${contador}" value="${nom}">
                            <input type="hidden" id="tol-${contador}" value="${tol}">
                            <input type="number" id="real-${contador}" value="${realVal}" oninput="evaluarVano(${contador})" placeholder="..." style="width:65px; padding:4px; text-align:center; font-weight:bold; border:2px solid var(--elecnor-blue); border-radius:4px; font-size:11px;">
                        </td>
                        <td style="padding:4px;text-align:center;">
                            <select id="sel-${contador}" class="select-estado ${selColorClass}" data-auto="true" style="pointer-events:none; width:60px;" tabindex="-1">
                                <option value="PENDIENTE" ${resp.estado==='PENDIENTE'?'selected':''} hidden>-</option>
                                <option value="ok" ${resp.estado==='OK'?'selected':''}>OK</option>
                                <option value="nok" ${resp.estado==='NOK'?'selected':''}>NOK</option>
                            </select>
                        </td>
                        <td class="td-acumulado" style="padding:4px;text-align:center;font-weight:bold;font-size:11px;">
                            ${realVal ? `<span style="color:var(--elecnor-blue)">${parseFloat(acumuladoReal.toFixed(2))}</span>` : `<span style="color:#ccc">-</span>`} <span style="color:#999">/ ${acumulado}</span>
                        </td>
                    </tr>`;
                    contador++;
                }

                html += `<tr class="row-obs">
                    <td colspan="6" style="text-align: left; padding: 6px;">
                        <div style="display:flex; gap: 8px; align-items:center;">
                            <span style="font-size:10px; font-weight:bold; color:#555; white-space:nowrap;">📋 Obs. Global:</span>
                            <textarea id="${sharedObsId}" placeholder="Anotar observaciones sobre las distancias de hincas...">${firstObs}</textarea>
                            <div style="flex-shrink:0;">
                                <input type="file" accept="image/*" style="display:none;" id="${sharedFileId}" onchange="procesarFotoParaAnotar(this, '${sharedImgId}')">
                                <button type="button" onclick="document.getElementById('${sharedFileId}').click()" style="font-size: 14px; padding: 4px 10px; background: #e2eaf0; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; color:var(--elecnor-blue); font-weight:bold; display:flex; align-items:center; height:32px;">📸 FOTO</button>
                            </div>
                        </div>
                        <img src="${firstFoto}" class="foto-preview" id="${sharedImgId}" style="display:${firstFoto?'block':'none'}; max-height:80px; width:auto; margin-top:5px; border:1px solid #ccc; cursor:pointer;" onclick="verGrande(this.src)">
                    </td>
                </tr>`;

                html += `</tbody></table></div>`;

            } else if (dataObj && dataObj.isTorqueTable) {
                const numPostes = dataObj.postes;
                const itemsTorque = dataObj.items;
                
                html += `<div class="table-responsive" style="margin: 0; padding: 0;"><table class="table-hincado">`;
                html += `<thead><tr><th class="item-desc" style="z-index: 3; width: 170px;">Elemento y Especificaciones</th>`;
                for(let p=1; p<=numPostes; p++) html += `<th>P ${p}</th>`;
                html += `</tr></thead><tbody>`;

                itemsTorque.forEach((item, rowIdx) => {
                    const sharedObsId = `shared-obs-torque-${rowIdx}`;
                    const sharedImgId = `shared-img-torque-${rowIdx}`;
                    const sharedFileId = `shared-file-torque-${rowIdx}`;
                    
                    let firstObs = '';
                    let firstFoto = '';

                    html += `<tr><td class="item-desc" style="white-space:normal; line-height:1.4; padding:6px;">
                        <span style="color:var(--elecnor-blue); font-weight:900; font-size:11px; display:block; margin-bottom:3px;">${item.desc}</span>
                        <span style="font-weight:normal; font-size:9px; color:#555;">
                            <b>Tipo:</b> ${item.tipo} | <b>M:</b> ${item.metrica}mm<br>
                            <b>Torque:</b> <span style="color:var(--danger-red); font-weight:bold;">${item.torque} N.m</span> | <b>Tol:</b> ${item.tol}
                        </span>
                    </td>`;
                    
                    if (item.perPile) {
                        for(let p=1; p<=numPostes; p++) {
                            const desc = `Poste ${p} - ${item.desc}`;
                            let resp = {estado: 'PENDIENTE', obs: '', foto: ''};
                            if(datosExistentes) {
                                const f = datosExistentes.find(d => d.bloque === bloqueLogico && d.titulo === desc);
                                if(f) {
                                    resp = f;
                                    if(!firstObs && f.obs) firstObs = f.obs;
                                    if(!firstFoto && f.foto) firstFoto = f.foto;
                                }
                            }

                            const selColorClass = resp.estado !== 'PENDIENTE' ? resp.estado.toLowerCase() : '';

                            html += `<td style="padding: 2px;">
                                <div class="inspeccion-item" data-bloque="${bloqueLogico}" data-desc="${desc}" data-shared-obs="${sharedObsId}" data-shared-img="${sharedImgId}" style="border:none; padding:0;">
                                    <select class="select-estado ${selColorClass}" onchange="this.className='select-estado '+this.value.toLowerCase(); actualizarProgreso();">
                                        <option value="PENDIENTE" ${resp.estado==='PENDIENTE'?'selected':''} hidden>-</option>
                                        <option value="ok" ${resp.estado==='OK'?'selected':''}>OK</option>
                                        <option value="nok" ${resp.estado==='NOK'?'selected':''}>NOK</option>
                                        <option value="na" ${resp.estado==='NA'?'selected':''}>N/A</option>
                                    </select>
                                </div>
                            </td>`;
                            contador++; 
                        }
                    } else {
                        const desc = item.desc;
                        let resp = {estado: 'PENDIENTE', obs: '', foto: ''};
                        let isDefaultNA = item.defaultNA === true;

                        if(datosExistentes) {
                            const f = datosExistentes.find(d => d.bloque === bloqueLogico && d.titulo === desc);
                            if(f) {
                                resp = f;
                                if(!firstObs && f.obs) firstObs = f.obs;
                                if(!firstFoto && f.foto) firstFoto = f.foto;
                            }
                        } else if (isDefaultNA) {
                            resp.estado = 'NA';
                        }

                        const selColorClass = resp.estado !== 'PENDIENTE' ? resp.estado.toLowerCase() : '';

                        if (isDefaultNA) {
                            html += `<td colspan="${numPostes}" style="padding: 10px; background: #eee; vertical-align: middle; border-bottom: 2px solid #ddd;">
                                <div class="inspeccion-item" data-bloque="${bloqueLogico}" data-desc="${desc}" data-shared-obs="${sharedObsId}" data-shared-img="${sharedImgId}" style="border:none; padding:0; display: flex; justify-content: center; align-items: center;">
                                    <span style="font-size:11px; font-weight:bold; color:#999; margin-right: 15px; text-transform:uppercase;">Validación Global de este elemento:</span>
                                    <span style="font-size:12px; color:#999; font-weight:bold; border: 1px solid #ccc; padding: 6px 20px; border-radius: 4px; background: #f9f9f9;">N/A</span>
                                    <select id="sel-${contador}" class="select-estado" style="display:none;" data-auto="true">
                                        <option value="na" selected>N/A</option>
                                    </select>
                                </div>
                            </td>`;
                            contador++;
                        } else {
                            html += `<td colspan="${numPostes}" style="padding: 10px; background: #fdfdfd; vertical-align: middle; border-bottom: 2px solid #ddd;">
                                <div class="inspeccion-item" data-bloque="${bloqueLogico}" data-desc="${desc}" data-shared-obs="${sharedObsId}" data-shared-img="${sharedImgId}" style="border:none; padding:0; display: flex; justify-content: center; align-items: center;">
                                    <span style="font-size:11px; font-weight:bold; color:#666; margin-right: 15px; text-transform:uppercase;">Validación Global de este elemento:</span>
                                    <select id="sel-${contador}" class="select-estado ${selColorClass}" onchange="this.className='select-estado '+this.value.toLowerCase(); actualizarProgreso();" style="width: 140px; padding: 10px; font-size: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                        <option value="PENDIENTE" ${resp.estado==='PENDIENTE'?'selected':''} hidden>-</option>
                                        <option value="ok" ${resp.estado==='OK'?'selected':''}>OK</option>
                                        <option value="nok" ${resp.estado==='NOK'?'selected':''}>NOK</option>
                                        <option value="na" ${resp.estado==='NA'?'selected':''}>N/A</option>
                                    </select>
                                </div>
                            </td>`;
                            contador++;
                        }
                    }
                    html += `</tr>`;
                    
                    html += `<tr class="row-obs">
                        <td colspan="${numPostes + 1}" style="text-align: left; padding: 6px;">
                            <div style="display:flex; gap: 8px; align-items:center;">
                                <span style="font-size:10px; font-weight:bold; color:#555; white-space:nowrap;">📋 Obs. Global:</span>
                                <textarea id="${sharedObsId}" placeholder="Anotar observaciones de los pares de apriete para este elemento...">${firstObs}</textarea>
                                <div style="flex-shrink:0;">
                                    <input type="file" accept="image/*" style="display:none;" id="${sharedFileId}" onchange="procesarFotoParaAnotar(this, '${sharedImgId}')">
                                    <button type="button" onclick="document.getElementById('${sharedFileId}').click()" style="font-size: 14px; padding: 4px 10px; background: #e2eaf0; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; color:var(--elecnor-blue); font-weight:bold; display:flex; align-items:center; height:32px;">📸 FOTO</button>
                                </div>
                            </div>
                            <img src="${firstFoto}" class="foto-preview" id="${sharedImgId}" style="display:${firstFoto?'block':'none'}; max-height:80px; width:auto; margin-top:5px; border:1px solid #ccc; cursor:pointer;" onclick="verGrande(this.src)">
                        </td>
                    </tr>`;
                });
                html += `</tbody></table></div>`;

            } else if (dataObj && dataObj.isVerificacionesTable) {
                const numPostes = dataObj.postes;
                const itemsVerif = dataObj.items;
                
                html += `<div class="table-responsive" style="margin: 0; padding: 0;"><table class="table-hincado">`;
                html += `<thead><tr><th class="item-desc" style="z-index: 3; width: 170px;">Referencia y Descripción</th>`;
                for(let p=1; p<=numPostes; p++) html += `<th>P ${p}</th>`;
                html += `</tr></thead><tbody>`;

                itemsVerif.forEach((item, rowIdx) => {
                    const sharedObsId = `shared-obs-verif-${rowIdx}`;
                    const sharedImgId = `shared-img-verif-${rowIdx}`;
                    const sharedFileId = `shared-file-verif-${rowIdx}`;
                    
                    let firstObs = '';
                    let firstFoto = '';

                    html += `<tr><td class="item-desc" style="white-space:normal; line-height:1.4; padding:6px;">
                        <span style="color:var(--elecnor-blue); font-weight:900; font-size:11px; display:block; margin-bottom:3px;">${item.desc}</span>
                        <span style="font-weight:normal; font-size:9px; color:#555;">
                            <b>Ref:</b> <span style="color:var(--danger-red); font-weight:bold;">${item.ref}</span><br>
                            <b>Tol:</b> ${item.tol} | <b>Rango:</b> ${item.rango}
                        </span>
                    </td>`;
                    
                    if (item.perPile !== false) {
                        for(let p=1; p<=numPostes; p++) {
                            const desc = `Poste ${p} - ${item.desc}`;
                            let resp = {estado: 'PENDIENTE', obs: '', foto: ''};

                            let isDefaultNA = false;
                            if (item.naPiles && item.naPiles.includes(p)) isDefaultNA = true;
                            if (item.activePiles && !item.activePiles.includes(p)) isDefaultNA = true;

                            if(datosExistentes) {
                                const f = datosExistentes.find(d => d.bloque === bloqueLogico && d.titulo === desc);
                                if(f) {
                                    resp = f;
                                    const rMatch = f.obs.match(/Valor: ([\d.-]+) \| (.*)/);
                                    if(rMatch) {
                                        if(!firstObs && rMatch[2]) firstObs = rMatch[2];
                                    } else {
                                        if(!firstObs && !f.obs.includes("Valor:")) firstObs = f.obs;
                                    }
                                }
                            } else if (isDefaultNA) {
                                resp.estado = 'NA';
                            }

                            if (isDefaultNA) {
                                html += `<td style="padding: 2px; background-color:#eee;">
                                    <div class="inspeccion-item" data-bloque="${bloqueLogico}" data-desc="${desc}" data-shared-obs="${sharedObsId}" data-shared-img="${sharedImgId}" style="border:none; padding:0; display:flex; justify-content:center; align-items:center; height:100%;">
                                        <span style="font-size:11px; color:#999; font-weight:bold;">N/A</span>
                                        <select class="select-estado" style="display:none;" data-auto="true">
                                            <option value="na" selected>N/A</option>
                                        </select>
                                    </div>
                                </td>`;
                                contador++;
                            } else {
                                let realVal = '';
                                if(resp.obs) {
                                    const rMatch = resp.obs.match(/Valor: ([\d.-]+)/);
                                    if(rMatch) realVal = rMatch[1];
                                }

                                const selColorClass = resp.estado !== 'PENDIENTE' ? resp.estado.toLowerCase() : '';
                                
                                let inputStyleColor = "border-color: #ccc; color: #333;";
                                if (realVal !== '') {
                                    const valNum = parseFloat(realVal);
                                    if (valNum >= item.min && valNum <= item.max) inputStyleColor = "border-color: var(--success-green); color: var(--success-green);";
                                    else inputStyleColor = "border-color: var(--danger-red); color: var(--danger-red);";
                                }

                                html += `<td style="padding: 2px; vertical-align:middle;">
                                    <div class="inspeccion-item" data-bloque="${bloqueLogico}" data-desc="${desc}" data-shared-obs="${sharedObsId}" data-shared-img="${sharedImgId}" style="border:none; padding:0; display: flex; flex-direction: column; align-items: center;">
                                        <input type="number" id="real-verif-${contador}" value="${realVal}" oninput="evaluarVerifNum(${contador}, ${item.min}, ${item.max})" placeholder="..." style="width: 100%; max-width: 55px; padding: 4px; font-size: 11px; font-weight: bold; text-align: center; border: 2px solid; border-radius: 4px; box-sizing: border-box; ${inputStyleColor}" step="any">
                                        <select id="sel-${contador}" data-auto="true" class="select-estado ${selColorClass}" style="pointer-events:none; width: 100%; max-width: 55px; padding: 4px 0; margin-top:4px; font-size:8px; opacity:0.9;" tabindex="-1">
                                            <option value="PENDIENTE" ${resp.estado==='PENDIENTE'?'selected':''} hidden>-</option>
                                            <option value="ok" ${resp.estado==='OK'?'selected':''}>OK</option>
                                            <option value="nok" ${resp.estado==='NOK'?'selected':''}>NOK</option>
                                        </select>
                                    </div>
                                </td>`;
                                contador++; 
                            }
                        }
                    } else if (item.isNumeric) {
                        const desc = item.desc;
                        let resp = {estado: 'PENDIENTE', obs: '', foto: ''};
                        let isDefaultNA = item.defaultNA === true;
                        
                        if(datosExistentes) {
                            const f = datosExistentes.find(d => d.bloque === bloqueLogico && d.titulo === desc);
                            if(f) {
                                resp = f;
                                const rMatch = f.obs.match(/Valor: ([\d.-]+) \| (.*)/);
                                if(rMatch) {
                                    if(!firstObs && rMatch[2]) firstObs = rMatch[2];
                                } else {
                                    if(!firstObs && !f.obs.includes("Valor:")) firstObs = f.obs;
                                }
                            }
                        } else if (isDefaultNA) {
                            resp.estado = 'NA';
                        }

                        const selColorClass = resp.estado !== 'PENDIENTE' ? resp.estado.toLowerCase() : '';
                        
                        if (isDefaultNA) {
                            html += `<td colspan="${numPostes}" style="padding: 4px; background: #eee; vertical-align: middle; border-bottom: 2px solid #ddd;">
                                <div class="inspeccion-item" data-bloque="${bloqueLogico}" data-desc="${desc}" data-shared-obs="${sharedObsId}" data-shared-img="${sharedImgId}" style="border:none; padding:0; display: flex; flex-direction: row; justify-content: center; align-items: center; gap: 10px;">
                                    <span style="font-size:11px; font-weight:bold; color:#999; text-transform:uppercase; margin: 0;">Valor Obtenido:</span>
                                    <span style="font-size:12px; color:#999; font-weight:bold; border: 1px solid #ccc; padding: 4px 20px; border-radius: 4px; background: #f9f9f9; height: 26px; box-sizing: border-box; display: flex; align-items: center;">N/A</span>
                                    <select id="sel-${contador}" data-auto="true" class="select-estado" style="display:none;" tabindex="-1">
                                        <option value="na" selected>N/A</option>
                                    </select>
                                </div>
                            </td>`;
                            contador++;
                        } else {
                            let realVal = '';
                            if(resp.obs) {
                                const rMatch = resp.obs.match(/Valor: ([\d.-]+)/);
                                if(rMatch) realVal = rMatch[1];
                            }
                            
                            let inputStyleColor = "border-color: #ccc; color: #333;";
                            if (realVal !== '') {
                                const valNum = parseFloat(realVal);
                                if (valNum >= item.min && valNum <= item.max) inputStyleColor = "border-color: var(--success-green); color: var(--success-green);";
                                else inputStyleColor = "border-color: var(--danger-red); color: var(--danger-red);";
                            }

                            html += `<td colspan="${numPostes}" style="padding: 4px; background: #fdfdfd; vertical-align: middle; border-bottom: 2px solid #ddd;">
                                <div class="inspeccion-item" data-bloque="${bloqueLogico}" data-desc="${desc}" data-shared-obs="${sharedObsId}" data-shared-img="${sharedImgId}" style="border:none; padding:0; display: flex; flex-direction: row; justify-content: center; align-items: center; gap: 10px;">
                                    <span style="font-size:11px; font-weight:bold; color:#666; text-transform:uppercase; margin: 0;">Valor Obtenido:</span>
                                    <input type="number" id="real-verif-${contador}" value="${realVal}" oninput="evaluarVerifNum(${contador}, ${item.min}, ${item.max})" placeholder="..." style="width: 70px; padding: 4px; font-size: 12px; font-weight: bold; text-align: center; border: 2px solid; border-radius: 4px; margin: 0; box-sizing: border-box; ${inputStyleColor}" step="any">
                                    <select id="sel-${contador}" data-auto="true" class="select-estado ${selColorClass}" style="pointer-events:none; width: 65px; padding: 6px; margin: 0; opacity:0.9;" tabindex="-1">
                                        <option value="PENDIENTE" ${resp.estado==='PENDIENTE'?'selected':''} hidden>-</option>
                                        <option value="ok" ${resp.estado==='OK'?'selected':''}>OK</option>
                                        <option value="nok" ${resp.estado==='NOK'?'selected':''}>NOK</option>
                                    </select>
                                </div>
                            </td>`;
                            contador++;
                        }
                    }
                    html += `</tr>`;
                    
                    html += `<tr class="row-obs">
                        <td colspan="${numPostes + 1}" style="text-align: left; padding: 6px;">
                            <div style="display:flex; gap: 8px; align-items:center;">
                                <span style="font-size:10px; font-weight:bold; color:#555; white-space:nowrap;">📋 Obs. Global:</span>
                                <textarea id="${sharedObsId}" placeholder="Anotar observaciones para estas verificaciones...">${firstObs}</textarea>
                                <div style="flex-shrink:0;">
                                    <input type="file" accept="image/*" style="display:none;" id="${sharedFileId}" onchange="procesarFotoParaAnotar(this, '${sharedImgId}')">
                                    <button type="button" onclick="document.getElementById('${sharedFileId}').click()" style="font-size: 14px; padding: 4px 10px; background: #e2eaf0; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; color:var(--elecnor-blue); font-weight:bold; display:flex; align-items:center; height:32px;">📸 FOTO</button>
                                </div>
                            </div>
                            <img src="${firstFoto}" class="foto-preview" id="${sharedImgId}" style="display:${firstFoto?'block':'none'}; max-height:80px; width:auto; margin-top:5px; border:1px solid #ccc; cursor:pointer;" onclick="verGrande(this.src)">
                        </td>
                    </tr>`;
                });
                html += `</tbody></table></div>`;

            } else {
                const itemsList = Array.isArray(dataObj) ? dataObj : [];
                itemsList.forEach((desc) => {
                    let resp = {estado: 'PENDIENTE', obs: '', foto: ''};
                    if(datosExistentes) {
                        const f = datosExistentes.find(d => d.bloque === bloqueLogico && d.titulo === desc);
                        if(f) resp = f; else if(esSubsanacion) return;
                    }
                    
                    const selColorClass = resp.estado !== 'PENDIENTE' ? resp.estado.toLowerCase() : '';

                    html += `<div class="inspeccion-item" data-bloque="${bloqueLogico}" data-desc="${desc}" style="background: white; padding: 12px; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px; gap: 10px;">
                            <span style="font-weight:bold; color:var(--elecnor-blue); font-size:12px; flex-grow:1;">${desc}</span>
                            <select id="sel-${contador}" class="select-estado ${selColorClass}" onchange="this.className='select-estado '+this.value.toLowerCase(); actualizarProgreso();" style="width: 110px; padding: 8px; font-size: 11px; flex-shrink:0;">
                                <option value="PENDIENTE" ${resp.estado==='PENDIENTE'?'selected':''} hidden>-</option>
                                <option value="ok" ${resp.estado==='OK'?'selected':''}>OK</option>
                                <option value="nok" ${resp.estado==='NOK'?'selected':''}>NOK</option>
                                <option value="na" ${resp.estado==='NA'?'selected':''}>N/A</option>
                            </select>
                        </div>
                        <div style="display:flex; gap: 8px; align-items:center;">
                            <span style="font-size:10px; font-weight:bold; color:#555; white-space:nowrap;">📋 Obs:</span>
                            <textarea id="obs-${contador}" placeholder="Anotar observaciones..." style="flex-grow:1; height:32px; padding:6px; font-size:11px; border:1px solid #ccc; border-radius:4px; resize:vertical; box-sizing:border-box;">${resp.obs}</textarea>
                            <div style="flex-shrink:0;">
                                <input type="file" accept="image/*" style="display:none;" id="file-${contador}" onchange="procesarFotoParaAnotar(this, 'prev-${contador}')">
                                <button type="button" onclick="document.getElementById('file-${contador}').click()" style="font-size: 14px; padding: 4px 10px; background: #e2eaf0; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; color:var(--elecnor-blue); font-weight:bold; display:flex; align-items:center; height:32px;">📸 FOTO</button>
                            </div>
                        </div>
                        <img src="${resp.foto}" class="foto-preview" id="prev-${contador}" style="display:${resp.foto?'block':'none'}; max-height:80px; width:auto; margin-top:8px; border:1px solid #ccc; border-radius:4px; cursor:pointer;" onclick="verGrande(this.src)">
                    </div>`;
                    contador++;
                });
            }
            return html;
        };

        if (estructura[bloquePrincipal].subgrupos) {
            for (const subKey in estructura[bloquePrincipal].subgrupos) {
                itemsHTML += `<h4 style="margin:15px 0 5px 0; color:var(--elecnor-blue); font-size:13px; border-bottom:1px solid #ccc; padding-bottom:4px; text-transform:uppercase;">${subKey}</h4>`;
                itemsHTML += procesarSeccion(subKey, estructura[bloquePrincipal].subgrupos[subKey]);
            }
        } else {
            itemsHTML += procesarSeccion(bloquePrincipal, estructura[bloquePrincipal]);
        }

        if(itemsHTML) {
            const bDiv = document.createElement('div'); 
            bDiv.className = 'seccion-principal';
            const bId = 'bloque-' + bloquePrincipal.replace(/[.\s]+/g, '');
            const btnTodoOk = bloquePrincipal === "6. Verificaciones finales" ? "" : `<button class="btn-ok-all" onclick="marcarTodoOk('${bloquePrincipal}')">Todo OK</button>`;
            bDiv.innerHTML = `<div class="cabecera-seccion"><span onclick="toggleBloque('${bId}')" style="flex-grow:1; cursor:pointer;">${bloquePrincipal} ▼</span>${btnTodoOk}</div><div class="contenido-seccion" id="${bId}" style="display:none;">${itemsHTML}</div>`;
            contenedor.appendChild(bDiv);
        }
    }
    actualizarProgreso();
}

function extraerDatosActuales() {
    const tempList = [];
    document.querySelectorAll('.inspeccion-item').forEach((item) => { 
        const radio = item.querySelector('input[type="radio"]:checked'); 
        const select = item.querySelector('select.select-estado');
        let estadoStr = 'PENDIENTE';
        if (radio) estadoStr = radio.value.toUpperCase();
        else if (select && select.value && select.value !== 'PENDIENTE') estadoStr = select.value.toUpperCase();

        const sharedObsId = item.dataset.sharedObs;
        const sharedImgId = item.dataset.sharedImg;

        let obsVal = '';
        const localArea = item.querySelector('textarea');
        if (localArea) {
            obsVal = localArea.value;
        } else if (sharedObsId) {
             const shArea = document.getElementById(sharedObsId);
             if(shArea) obsVal = shArea.value;
        }

        const realInput = item.querySelector('input[type="number"]');
        if(realInput && realInput.value) {
            if (realInput.id.startsWith('real-verif-')) {
                obsVal = `Valor: ${realInput.value} | ` + obsVal;
            } else {
                obsVal = `Medida Real: ${realInput.value} mm | ` + obsVal;
            }
        }

        const imgEl = item.querySelector('img.foto-preview') || (sharedImgId ? document.getElementById(sharedImgId) : null);
        
        tempList.push({ 
            bloque: item.dataset.bloque, 
            titulo: item.dataset.desc, 
            estado: estadoStr, 
            obs: obsVal, 
            foto: imgEl && imgEl.src.startsWith('data') ? imgEl.src : '' 
        }); 
    });
    return tempList.length > 0 ? tempList : null;
}

async function guardarDatosCore() { 
    const eq = document.getElementById('ins-equipo').value.trim(), sup = document.getElementById('ins-supervisor').value.trim(); 
    if (!eq || !sup) { alert("Completa Equipo y Supervisor"); return false; } 
    let data = await localforage.getItem('inspecciones_data') || {}; 
    const idI = document.getElementById('edit-id').value || Date.now().toString(); 
    const d = document.getElementById('ins-disciplina').value;
    let sub = d === 'CIV' ? document.getElementById('ins-sub-civil').value : (d === 'ELE' ? document.getElementById('ins-sub-ele').value : document.getElementById('ins-modelo-mec').value + " | " + document.getElementById('ins-fila-mec').value);
    
    const n = { 
        idInterno: idI, 
        id: actualizarID(), 
        revision: parseInt(document.getElementById('ins-revision').value)||0, 
        fecha: document.getElementById('ins-fecha').value, 
        zona: document.getElementById('ins-zona').value, 
        disciplina: d, 
        subDisciplina: sub, 
        equipo: eq, 
        supervisor: sup, 
        gps: document.getElementById('ins-gps').value, 
        numPostes: parseInt(document.getElementById('ins-num-postes').value), 
        checklist: extraerDatosActuales() || [], 
        firmaSup: pads['pad-supervisor'].canvas.toDataURL(), 
        firmaProp: pads['pad-propiedad'].canvas.toDataURL() 
    }; 
    
    data[idI] = n; await localforage.setItem('inspecciones_data', data); return true; 
}

async function guardarInspeccion() { if (await guardarDatosCore()) irInicio(); }
async function guardarYContinuar() { if (await guardarDatosCore()) { document.getElementById('edit-id').value=""; document.getElementById('ins-equipo').value=""; cargarChecklist(); clearSig('pad-supervisor'); clearSig('pad-propiedad'); window.scrollTo(0,0); } }

async function renderListado() { 
    const dataObj = await localforage.getItem('inspecciones_data') || {}; 
    const tbody = document.querySelector('#tabla-listado tbody'); 
    tbody.innerHTML = '';
    
    // Leemos qué ha escrito el usuario en los filtros
    const fId = document.getElementById('filtro-id').value.toLowerCase();
    const fDesde = document.getElementById('filtro-desde').value;
    const fHasta = document.getElementById('filtro-hasta').value;
    const fDisc = document.getElementById('filtro-disc').value;
    const fEq = document.getElementById('filtro-equipo').value.toLowerCase();
    const fSup = document.getElementById('filtro-sup').value.toLowerCase();
    const fRes = document.getElementById('filtro-res').value;

    let lista = Object.values(dataObj).sort((a,b)=>b.idInterno-a.idInterno);
    
    // Aplicamos la inteligencia para descartar lo que no coincida
    lista = lista.filter(ins => {
        const nc = ins.checklist.some(c=>c.estado==='NOK');
        const p = ins.checklist.some(c=>c.estado==='PENDIENTE');
        let resStr = "OK"; 
        if(p) resStr = "INCOMPLETO"; 
        else if(nc) resStr = "FALLO";

        if (fId && !ins.id.toLowerCase().includes(fId)) return false;
        if (fDesde && ins.fecha < fDesde) return false;
        if (fHasta && ins.fecha > fHasta) return false;
        if (fDisc !== 'TODOS' && ins.disciplina !== fDisc) return false;
        if (fEq && (!ins.equipo || !ins.equipo.toLowerCase().includes(fEq))) return false;
        if (fSup && (!ins.supervisor || !ins.supervisor.toLowerCase().includes(fSup))) return false;
        if (fRes !== 'TODOS' && resStr !== fRes) return false;
        return true;
    });

    // Pintamos solo los que han sobrevivido al filtro
    lista.forEach(ins => {
        const nc = ins.checklist.some(c=>c.estado==='NOK');
        const p = ins.checklist.some(c=>c.estado==='PENDIENTE');
        let txt="OK", col="green"; 
        if(p){txt="INC"; col="orange";} else if(nc){txt="FALLO"; col="red";}
        
        tbody.innerHTML += `<tr>
            <td><span class="link-id" onclick="editarInspeccion('${ins.idInterno}')">${ins.id}</span></td>
            <td>${ins.fecha}</td>
            <td>${ins.disciplina}</td>
            <td>${ins.equipo}</td>
            <td>${ins.supervisor}</td>
            <td style="color:${col}; font-weight:bold;">${txt}</td>
            <td style="display:flex; gap:5px; justify-content:center;">
                <button style="background:var(--warning-orange); color:white; font-size:11px; padding:5px 10px; border:none; border-radius:4px; cursor:pointer;" onclick="reinspeccionar('${ins.idInterno}')" title="Crear nueva revisión de esta inspección">↻ REINSP.</button>
                <button style="background:var(--elecnor-blue); color:white; font-size:11px; padding:5px 10px; border:none; border-radius:4px; cursor:pointer;" onclick="generarPDF('${ins.idInterno}')">PDF</button>
            </td>
        </tr>`;
    });
}

async function reinspeccionar(idOld) {
    const data = await localforage.getItem('inspecciones_data'); 
    const ins = data[idOld];
    
    document.getElementById('edit-id').value = ""; 
    document.getElementById('ins-revision').value = (parseInt(ins.revision) || 0) + 1;
    
    document.getElementById('portada').style.display='none'; 
    document.getElementById('listado').style.display='none'; 
    document.getElementById('dashboard-view').style.display='none'; 
    document.getElementById('checklist').style.display='block';
    
    document.getElementById('ins-fecha').valueAsDate = new Date(); 
    document.getElementById('ins-zona').value = ins.zona; 
    document.getElementById('ins-disciplina').value = ins.disciplina;
    if (ins.disciplina === 'MEC' && ins.subDisciplina) {
        const parts = ins.subDisciplina.split(" | ");
        document.getElementById('ins-modelo-mec').value = parts[0]; 
        document.getElementById('ins-fila-mec').value = parts[1];
    }
    document.getElementById('ins-equipo').value = ins.equipo; 
    document.getElementById('ins-supervisor').value = ins.supervisor; 
    document.getElementById('ins-gps').value = ins.gps; 
    document.getElementById('ins-num-postes').value = ins.numPostes;
    
    actualizarEtiquetasEquipo(); 
    cargarChecklist(ins.checklist);
    actualizarID(); 
    
    setTimeout(() => { 
        initPads(); 
        clearSig('pad-supervisor');
        clearSig('pad-propiedad');
        window.scrollTo(0, 0);
    }, 200);
}

function nuevaInspeccion() { 
    document.getElementById('edit-id').value=""; 
    document.getElementById('ins-revision').value=0; 
    document.getElementById('portada').style.display='none'; 
    document.getElementById('listado').style.display='none'; 
    document.getElementById('dashboard-view').style.display='none'; 
    document.getElementById('checklist').style.display='block'; 
    document.getElementById('ins-fecha').valueAsDate = new Date(); 
    cambioDisciplinaMecanica(); 
    setTimeout(initPads, 200); 
}

async function editarInspeccion(idI) { 
    const data = await localforage.getItem('inspecciones_data'); 
    const ins = data[idI];
    document.getElementById('edit-id').value=idI; 
    document.getElementById('ins-revision').value=ins.revision;
    document.getElementById('portada').style.display='none'; 
    document.getElementById('listado').style.display='none'; 
    document.getElementById('dashboard-view').style.display='none'; 
    document.getElementById('checklist').style.display='block';
    document.getElementById('ins-fecha').value=ins.fecha; 
    document.getElementById('ins-zona').value=ins.zona; 
    document.getElementById('ins-disciplina').value=ins.disciplina;
    if(ins.disciplina === 'MEC' && ins.subDisciplina) {
        const parts = ins.subDisciplina.split(" | ");
        document.getElementById('ins-modelo-mec').value = parts[0]; 
        document.getElementById('ins-fila-mec').value = parts[1];
    }
    document.getElementById('ins-equipo').value=ins.equipo; 
    document.getElementById('ins-supervisor').value=ins.supervisor; 
    document.getElementById('ins-gps').value=ins.gps; 
    document.getElementById('ins-num-postes').value=ins.numPostes;
    actualizarEtiquetasEquipo(); 
    cargarChecklist(ins.checklist);
    setTimeout(() => { 
        initPads(); 
        if(ins.firmaSup) { let i = new Image(); i.onload = () => pads['pad-supervisor'].ctx.drawImage(i,0,0); i.src = ins.firmaSup; }
        if(ins.firmaProp) { let i = new Image(); i.onload = () => pads['pad-propiedad'].ctx.drawImage(i,0,0); i.src = ins.firmaProp; }
    }, 200);
}

function verGrande(src) { document.getElementById('modalFoto').style.display='flex'; document.getElementById('imgModal').src=src; }

let idFotoActual, imgFotoActual, ctxAnotacion, dibujandoAnotacion;
function procesarFotoParaAnotar(input, id) { if (input.files?.[0]) { const r = new FileReader(); r.onload = (e) => { imgFotoActual = new Image(); imgFotoActual.onload = () => abrirModalAnotacion(id); imgFotoActual.src = e.target.result; }; r.readAsDataURL(input.files[0]); } }
function abrirModalAnotacion(id) { idFotoActual = id; document.getElementById('modalAnotacion').style.display = 'flex'; const c = document.getElementById('canvas-anotacion'); ctxAnotacion = c.getContext('2d'); c.width = 460; c.height = 320; ctxAnotacion.drawImage(imgFotoActual, 0, 0, 460, 320); ctxAnotacion.strokeStyle = 'red'; ctxAnotacion.lineWidth = 4; }
function cerrarModalAnotacion() { document.getElementById('modalAnotacion').style.display = 'none'; }
function limpiarAnotacion() { ctxAnotacion.drawImage(imgFotoActual, 0, 0, 460, 320); }
function guardarAnotacion() { 
    const c = document.getElementById('canvas-anotacion'); 
    const elementId = typeof idFotoActual === 'string' ? idFotoActual : 'prev-'+idFotoActual;
    const targetImg = document.getElementById(elementId);
    targetImg.src = c.toDataURL('image/jpeg', 0.8); 
    targetImg.style.display = 'block'; 
    cerrarModalAnotacion(); 
}
function initAnotacion() {
    const c = document.getElementById('canvas-anotacion');
    c.addEventListener('mousedown', (e) => { dibujandoAnotacion = true; ctxAnotacion.beginPath(); ctxAnotacion.moveTo(e.offsetX, e.offsetY); });
    c.addEventListener('mousemove', (e) => { if(dibujandoAnotacion) { ctxAnotacion.lineTo(e.offsetX, e.offsetY); ctxAnotacion.stroke(); } });
    window.addEventListener('mouseup', () => dibujandoAnotacion = false);
}

async function generarPDF(idI) {
    const data = await localforage.getItem('inspecciones_data');
    const ins = data[idI];
    const doc = new jsPDF('landscape'); 

    let logoParaPDF = configGeneral.logo;
    if (!logoParaPDF) {
        try {
            const response = await fetch('logo.jpg');
            if (response.ok) {
                const blob = await response.blob();
                logoParaPDF = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            }
        } catch (e) { console.log("No se pudo cargar logo automáticamente."); }
    }

    doc.setFillColor(0, 85, 150);
    doc.rect(10, 10, 277, 12, 'F');
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, 'bold');
    doc.text(`INFORME DE INSPECCIÓN: ${ins.id}`, 15, 18);

    if (logoParaPDF) {
        try {
            let imgFormat = logoParaPDF.includes('image/png') ? 'PNG' : 'JPEG';
            doc.addImage(logoParaPDF, imgFormat, 245, 11, 35, 10);
        } catch (e) { doc.setFontSize(10); doc.text("ELECNOR", 255, 18); }
    } else {
        doc.setFontSize(10);
        doc.text("ELECNOR", 255, 18);
    }

    doc.setDrawColor(0, 85, 150);
    doc.setLineWidth(0.5);
    doc.rect(10, 22, 277, 22);
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'bold');
    doc.text(`PROYECTO:`, 15, 28); doc.text(`CLIENTE:`, 150, 28);
    doc.text(`EQUIPO / TRAMO:`, 15, 34); doc.text(`DISCIPLINA:`, 150, 34);
    doc.text(`SUPERVISOR:`, 15, 40); doc.text(`FECHA:`, 150, 40); doc.text(`GPS:`, 210, 40);

    doc.setFont(undefined, 'normal');
    doc.text(configGeneral.proyecto, 38, 28); doc.text(configGeneral.cliente, 168, 28);
    doc.text(`${ins.equipo} (${ins.subDisciplina})`, 48, 34); doc.text(ins.disciplina, 172, 34);
    doc.text(ins.supervisor, 39, 40); doc.text(ins.fecha, 165, 40); doc.text(ins.gps || 'N/D', 220, 40);

    let startY = 52;
    const numPostes = ins.numPostes || 1; 
    const bloques = {};
    ins.checklist.forEach(c => { if(!bloques[c.bloque]) bloques[c.bloque] = []; bloques[c.bloque].push(c); });

    for (const nombreBloque in bloques) {
        const itemsBloque = bloques[nombreBloque];
        const filasMap = {};

        itemsBloque.forEach(c => {
            let baseDesc = c.titulo; let pIndex = null;
            const matchPoste = c.titulo.match(/^Poste (\d+) - (.*)$/);
            if (matchPoste) { pIndex = parseInt(matchPoste[1]); baseDesc = matchPoste[2]; }
            const matchVano = c.titulo.match(/^Vano (\d+)-\d+: (.*)$/);
            if (matchVano) { pIndex = parseInt(matchVano[1]); baseDesc = matchVano[2]; }

            if (!filasMap[baseDesc]) filasMap[baseDesc] = { desc: baseDesc, postes: {}, globales: [], obsGlobal: '', fotoGlobal: '' };
            let displayVal = c.estado === 'PENDIENTE' ? 'PEND.' : c.estado;
            const valMatch = c.obs.match(/(?:Valor|Medida Real): ([\d.-]+)/);
            if (valMatch) displayVal = valMatch[1];

            let textObs = c.obs.replace(/(?:Valor|Medida Real): ([\d.-]+) (?:mm )?\|? ?/, '').trim();
            if (pIndex !== null) { filasMap[baseDesc].postes[pIndex] = displayVal; } 
            else { filasMap[baseDesc].globales.push(displayVal); }

            if (textObs && !filasMap[baseDesc].obsGlobal.includes(textObs)) {
                filasMap[baseDesc].obsGlobal += (filasMap[baseDesc].obsGlobal ? ' | ' : '') + textObs;
            }
            if (c.foto && c.foto.startsWith('data:image')) { filasMap[baseDesc].fotoGlobal = c.foto; }
        });

        let hasPostes = false;
        for (const d in filasMap) { if (Object.keys(filasMap[d].postes).length > 0) { hasPostes = true; break; } }

        const head = [['Ítem']];
        if (hasPostes) { for(let i=1; i<=numPostes; i++) head[0].push(`P${i}`); } else { head[0].push('Estado'); }
        head[0].push('Observaciones');

        const body = [];
        for (const desc in filasMap) {
            const fData = filasMap[desc]; const row = [fData.desc];
            if (hasPostes) {
                if (fData.globales.length > 0 && Object.keys(fData.postes).length === 0) {
                    row.push({ content: fData.globales[0], colSpan: numPostes, styles: { halign: 'center', fontStyle: 'bold' } });
                } else { for(let i=1; i<=numPostes; i++) row.push(fData.postes[i] || '-'); }
            } else { row.push({ content: (fData.globales[0] || '-'), styles: { halign: 'center', fontStyle: 'bold' } }); }
            let obsTxt = fData.obsGlobal.trim();
            if (fData.fotoGlobal) obsTxt += (obsTxt ? ' | ' : '') + "[VER FOTO EN ANEXO]";
            row.push(obsTxt);
            body.push(row);
        }

        doc.setFontSize(10); doc.setTextColor(0, 85, 150); doc.setFont(undefined, 'bold');
        doc.text(nombreBloque.toUpperCase(), 10, startY);

        let colStyles = { 0: { halign: 'left', cellWidth: 40, fontStyle: 'bold' } };
        if (hasPostes) { for(let i=1; i<=numPostes; i++) { colStyles[i] = { halign: 'center', cellWidth: 12 }; } colStyles[numPostes + 1] = { halign: 'left', cellWidth: 'auto' }; }
        else { colStyles[1] = { halign: 'center', cellWidth: 25 }; colStyles[2] = { halign: 'left', cellWidth: 'auto' }; }

        doc.autoTable({
            startY: startY + 3, head: head, body: body, theme: 'grid',
            styles: { fontSize: 7, cellPadding: 1.5, halign: 'center', valign: 'middle' },
            headStyles: { fillColor: [240, 240, 240], textColor: [0, 85, 150], fontStyle: 'bold' },
            columnStyles: colStyles, margin: { left: 10, right: 10 },
            didParseCell: function(data) {
                if (data.section === 'body' && data.column.index > 0) {
                    let v = (typeof data.cell.raw === 'object' && data.cell.raw !== null) ? data.cell.raw.content : data.cell.raw;
                    const isObs = hasPostes ? (data.column.index === numPostes + 1) : (data.column.index === 2);
                    if (!isObs) {
                        if (v === 'OK') { data.cell.styles.textColor = [40, 167, 69]; data.cell.styles.fontStyle = 'bold'; }
                        else if (v === 'NOK') { data.cell.styles.textColor = [220, 53, 69]; data.cell.styles.fontStyle = 'bold'; }
                        else if (v === 'PEND.') { data.cell.styles.textColor = [255, 152, 0]; }
                        else if (v !== '-' && v !== '') { data.cell.styles.textColor = [0, 85, 150]; data.cell.styles.fontStyle = 'bold'; }
                    }
                }
            }
        });
        startY = doc.lastAutoTable.finalY + 12;
        if (startY > doc.internal.pageSize.height - 30) { doc.addPage(); startY = 20; }
    }

    if (startY > doc.internal.pageSize.height - 65) { doc.addPage(); startY = 20; } else { startY += 5; }
    doc.setDrawColor(0, 85, 150); doc.setLineWidth(0.5);
    doc.rect(25, startY, 100, 45); doc.rect(165, startY, 100, 45);
    doc.setFontSize(9); doc.text("FIRMA SUPERVISOR ELECNOR", 35, startY + 8); doc.text("FIRMA PROPIEDAD / CLIENTE", 175, startY + 8);
    if (ins.firmaSup && ins.firmaSup.length > 500) doc.addImage(ins.firmaSup, 'PNG', 35, startY + 12, 80, 25);
    if (ins.firmaProp && ins.firmaProp.length > 500) doc.addImage(ins.firmaProp, 'PNG', 175, startY + 12, 80, 25);

    const fotosUnicas = []; const setFotos = new Set();
    ins.checklist.forEach(c => {
        if (c.foto && c.foto.startsWith('data:image') && !setFotos.has(c.foto)) {
            setFotos.add(c.foto); fotosUnicas.push(c);
        }
    });

    if (fotosUnicas.length > 0) {
        doc.addPage();
        doc.setFillColor(0, 85, 150); doc.rect(10, 10, 277, 12, 'F');
        doc.setFontSize(14); doc.setTextColor(255, 255, 255); doc.text(`ANEXO FOTOGRÁFICO - ${ins.id}`, 15, 18);
        let fY = 35; let fX = 15; const imgW = 120; const imgH = 80;
        fotosUnicas.forEach((f, i) => {
            if (i > 0 && i % 2 === 0) { fX = 15; fY += imgH + 30; }
            if (fY + imgH > doc.internal.pageSize.height - 20) { doc.addPage(); fY = 20; fX = 15; }
            doc.setDrawColor(200); doc.rect(fX - 1, fY - 1, imgW + 2, imgH + 2);
            doc.addImage(f.foto, 'JPEG', fX, fY, imgW, imgH);
            doc.setFontSize(9); doc.setTextColor(0, 85, 150);
            const tit = f.titulo.replace(/^Poste \d+ - /, "").replace(/^Vano \d+-\d+: /, "");
            doc.text(`${f.bloque}: ${tit}`, fX, fY + imgH + 6);
            doc.setTextColor(100); doc.text(`Estado: ${f.estado} | Obs: ${f.obs.replace(/^(Valor|Medida Real): [\d.-]+ mm \| /, "")}`, fX, fY + imgH + 11);
            fX += imgW + 15;
        });
    }
    doc.save(`${ins.id}.pdf`);
}

async function exportarPunchlist() {
    try {
        const dataObj = await localforage.getItem('inspecciones_data') || {};
        const allReports = Object.values(dataObj);

        if (allReports.length === 0) {
            alert("No hay inspecciones registradas.");
            return;
        }

        const uniqueEquip = {};
        allReports.forEach(ins => {
            const baseId = ins.id.split('-R')[0];
            const sub = ins.subDisciplina || "MEC";
            const uniqueKey = `${ins.disciplina}-${sub}-${baseId}`;
            const rev = ins.revision || 0;
            
            if (!uniqueEquip[uniqueKey] || rev >= (uniqueEquip[uniqueKey].revision || 0)) {
                uniqueEquip[uniqueKey] = ins;
            }
        });

        const punchlistItems = [];
        Object.values(uniqueEquip).forEach(ins => {
            if (ins.checklist) {
                ins.checklist.forEach(c => {
                    if (c.estado === 'NOK' || c.estado === 'PENDIENTE') {
                        punchlistItems.push([
                            ins.id,
                            ins.fecha,
                            ins.zona,
                            ins.disciplina,
                            ins.subDisciplina || '-',
                            ins.equipo,
                            c.bloque,
                            c.titulo,
                            c.estado,
                            c.obs || '-'
                        ]);
                    }
                });
            }
        });

        if (punchlistItems.length === 0) {
            alert("¡Buenas noticias! No hay defectos (NOK) ni ítems pendientes en las últimas revisiones de los equipos.");
            return;
        }

        // 1. Obtener el archivo físico que está en nuestra carpeta
        const response = await fetch('Plantilla_SIGMA.xlsx');
        if (!response.ok) throw new Error("No se encontró el archivo Plantilla_SIGMA.xlsx en la carpeta de la App.");
        
        // 2. Leerlo con ExcelJS
        const arrayBuffer = await response.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);

        // 3. Seleccionar la pestaña de datos puros que hizo Copilot
        const worksheet = workbook.getWorksheet('DATOS_APP');
        if (!worksheet) throw new Error("La plantilla no tiene la hoja 'DATOS_APP'. Revisa el nombre.");

        // 4. Volcar las filas
        punchlistItems.forEach(item => {
            worksheet.addRow(item);
        });

        // 5. Compilar el archivo modificado y forzar la descarga
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        const fechaHoy = new Date().toISOString().split('T')[0];
        a.download = `SIGMA_Punchlist_Actualizado_${fechaHoy}.xlsx`;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

    } catch (error) {
        console.error("Error generando el Excel:", error);
        alert("Hubo un error al exportar el Punchlist: " + error.message);
    }
}

function abrirIndicePlanos() {
    window.open('planos/indice.pdf', '_blank');
}
function abrirIndicePlanos() {
    window.open('planos/indice.pdf', '_blank');
}