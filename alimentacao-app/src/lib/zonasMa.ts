/** Cadastro oficial das zonas eleitorais do Maranhão (TRE-MA). */

export interface ZonaEleitoralMA {
  numero: string
  titulo: string
  sede: string
  municipios: string[]
  bairros: string[]
  /** Centro aproximado da sede / mancha. */
  lat: number
  lng: number
  /** Raio da mancha em metros (interior / sede). */
  radiusMeters: number
  /** Pontos dos bairros para polígono (capital). */
  pontos?: { lat: number; lng: number; nome?: string }[]
}

function z(
  numero: number | string,
  sede: string,
  municipios: string[],
  lat: number,
  lng: number,
  extras?: Partial<ZonaEleitoralMA>,
): ZonaEleitoralMA {
  const n = String(numero).padStart(3, '0')
  return {
    numero: n,
    titulo: `${Number(n)}ª Zona`,
    sede,
    municipios,
    bairros: extras?.bairros ?? [],
    lat,
    lng,
    radiusMeters: extras?.radiusMeters ?? 4500,
    pontos: extras?.pontos,
  }
}

/** Todas as zonas com sede, municípios e bairros (quando capital). */
export const ZONAS_ELEITORAIS_MA: ZonaEleitoralMA[] = [
  // —— São Luís ——
  z(1, 'São Luís', ['São Luís'], -2.5297, -44.3028, {
    radiusMeters: 2800,
    bairros: [
      'Alto Esperança', 'Anjo da Guarda', 'Bacanga', 'Centro', 'Cidade Nova', 'Diamante',
      'Fumacê', 'Madre Deus', 'Sá Viana', 'São Raimundo', 'Vila Bacanga', 'Vila Embratel',
      'Vila Isabel', 'Vila Mauro Fecury I', 'Vila Nova', 'Vila São Luís',
    ],
    pontos: [
      { lat: -2.5297, lng: -44.3028, nome: 'Centro' },
      { lat: -2.5450, lng: -44.3200, nome: 'Bacanga' },
      { lat: -2.5550, lng: -44.3150, nome: 'Anjo da Guarda' },
      { lat: -2.5600, lng: -44.3300, nome: 'Vila Embratel' },
      { lat: -2.5480, lng: -44.3400, nome: 'Vila Mauro Fecury I' },
      { lat: -2.5350, lng: -44.3150, nome: 'Madre Deus' },
      { lat: -2.5200, lng: -44.2950, nome: 'Cidade Nova' },
      { lat: -2.5150, lng: -44.3100, nome: 'Diamante' },
      { lat: -2.5400, lng: -44.2950, nome: 'São Raimundo' },
      { lat: -2.5500, lng: -44.3050, nome: 'Fumacê' },
      { lat: -2.5580, lng: -44.3250, nome: 'Sá Viana' },
      { lat: -2.5650, lng: -44.3180, nome: 'Alto Esperança' },
    ],
  }),
  z(2, 'São Luís', ['São Luís'], -2.5450, -44.2800, {
    radiusMeters: 2800,
    bairros: [
      'Alemanha', 'Bairro de Fátima', 'Bom Jesus', 'Camboa', 'Caratatiua', 'Coroadinho',
      'Coroado', 'Filipinho', 'Ivar Saldanha', 'João Paulo', 'Liberdade', 'Monte Castelo',
      'Parque Timbiras', 'Sacavém', 'Vila Palmeira', 'Vila Passos',
    ],
    pontos: [
      { lat: -2.5450, lng: -44.2800, nome: 'Monte Castelo' },
      { lat: -2.5550, lng: -44.2700, nome: 'João Paulo' },
      { lat: -2.5600, lng: -44.2600, nome: 'Coroadinho' },
      { lat: -2.5500, lng: -44.2550, nome: 'Sacavém' },
      { lat: -2.5350, lng: -44.2750, nome: 'Camboa' },
      { lat: -2.5400, lng: -44.2650, nome: 'Liberdade' },
      { lat: -2.5480, lng: -44.2900, nome: 'Alemanha' },
      { lat: -2.5520, lng: -44.2850, nome: 'Bairro de Fátima' },
      { lat: -2.5580, lng: -44.2750, nome: 'Filipinho' },
      { lat: -2.5650, lng: -44.2680, nome: 'Coroado' },
      { lat: -2.5380, lng: -44.2880, nome: 'Vila Passos' },
    ],
  }),
  z(3, 'São Luís', ['São Luís'], -2.5100, -44.2700, {
    radiusMeters: 3200,
    bairros: [
      'Alemanha', 'Angelim', 'Angelim Velho', 'Bequimão', 'Calhau', 'Cohafuma', 'Filipinho',
      'Ipase', 'Jaracati', 'João Paulo', 'Jordoa', 'Maranhão Novo', 'Outeiro da Cruz',
      'Radional', 'Renascença I', 'Renascença II', 'Rio Anil', 'Sacavém', 'Santa Cruz',
      'Santo Antônio', 'São Francisco', 'Vila Lobão', 'Vinhais',
    ],
    pontos: [
      { lat: -2.4900, lng: -44.2700, nome: 'São Francisco' },
      { lat: -2.4950, lng: -44.2550, nome: 'Calhau' },
      { lat: -2.5050, lng: -44.2800, nome: 'Renascença' },
      { lat: -2.5150, lng: -44.3000, nome: 'Bequimão' },
      { lat: -2.5250, lng: -44.2900, nome: 'Vinhais' },
      { lat: -2.5300, lng: -44.2700, nome: 'Angelim' },
      { lat: -2.5200, lng: -44.2500, nome: 'Ponta / Calhau leste' },
      { lat: -2.5400, lng: -44.2850, nome: 'Rio Anil' },
      { lat: -2.5000, lng: -44.2900, nome: 'Jaracati' },
      { lat: -2.5120, lng: -44.2650, nome: 'Cohafuma' },
    ],
  }),
  z(10, 'São Luís', ['São Luís'], -2.5600, -44.2400, {
    radiusMeters: 5000,
    bairros: [
      'Anil', 'Aurora', 'Cohab Anil III', 'Coqueiro', 'Cruzeiro do Anil', 'Estiva', 'Forquilha',
      'Inhaúma', 'Itapera', 'Jardim São Cristóvão', 'João de Deus', 'Maracanã', 'Pedrinhas',
      'Porto Grande', 'Quebra-Pote', 'Rio dos Cachorros', 'Rio Grande', 'São Bernardo',
      'São Cristóvão', 'Tauá-Mirim', 'Vila Esperança', 'Vila Itamar', 'Vila Maranhão',
      'Vila Nova República', 'Vila Samara', 'Vila Sarney',
    ],
    pontos: [
      { lat: -2.5500, lng: -44.2600, nome: 'Anil' },
      { lat: -2.5650, lng: -44.2450, nome: 'São Cristóvão' },
      { lat: -2.5750, lng: -44.2300, nome: 'João de Deus' },
      { lat: -2.5850, lng: -44.2500, nome: 'Maracanã' },
      { lat: -2.5400, lng: -44.2300, nome: 'Forquilha' },
      { lat: -2.5950, lng: -44.2600, nome: 'Vila Maranhão' },
      { lat: -2.5600, lng: -44.2200, nome: 'Pedrinhas' },
      { lat: -2.5700, lng: -44.2100, nome: 'Itapera' },
      { lat: -2.5550, lng: -44.2750, nome: 'Cruzeiro do Anil' },
    ],
  }),
  z(76, 'São Luís', ['São Luís'], -2.5000, -44.2400, {
    radiusMeters: 3500,
    bairros: [
      'Barramar', 'Calhau', 'Cohab Anil I', 'Cohab Anil IV', 'Cohab Turu', 'Cohajap', 'Cohama',
      'Cohaserma', 'Cohatrac', 'Cohatrac II', 'Cohatrac III', 'Divinéia', 'Habitacional Turu',
      "Olho D'Água", 'Recanto dos Vinhais', 'Residencial Primavera', 'Sol e Mar', 'Turu',
      'Vila Luizão', 'Vila Vicente Fialho', 'Vinhais',
    ],
    pontos: [
      { lat: -2.4900, lng: -44.2500, nome: 'Calhau / Sol e Mar' },
      { lat: -2.5050, lng: -44.2300, nome: 'Olho D\'Água' },
      { lat: -2.5150, lng: -44.2200, nome: 'Turu' },
      { lat: -2.5250, lng: -44.2450, nome: 'Cohatrac' },
      { lat: -2.5100, lng: -44.2600, nome: 'Cohama' },
      { lat: -2.5200, lng: -44.2700, nome: 'Vinhais' },
      { lat: -2.5000, lng: -44.2650, nome: 'Cohajap' },
      { lat: -2.5300, lng: -44.2350, nome: 'Cohatrac II/III' },
    ],
  }),
  z(89, 'São Luís', ['São Luís'], -2.5948, -44.1925, {
    radiusMeters: 2200,
    bairros: [
      'Cidade Olímpica', 'Cidade Operária', 'IPEM São Cristóvão', 'Jardim América',
      'Santa Bárbara', 'Santa Clara', 'Santa Efigênia', 'São Cristóvão', 'São Raimundo',
      'Tajaçuaba', 'Tajipuru', 'Tibiri', 'Vila Cascavel', 'Vila Janaína', 'Vila Magril',
    ],
    pontos: [
      { lat: -2.59435, lng: -44.18355, nome: 'Cidade Olímpica' },
      { lat: -2.59610, lng: -44.19733, nome: 'Cidade Operária' },
      { lat: -2.58850, lng: -44.20500, nome: 'IPEM São Cristóvão' },
      { lat: -2.59000, lng: -44.19050, nome: 'Jardim América' },
      { lat: -2.59150, lng: -44.20100, nome: 'Santa Bárbara' },
      { lat: -2.59300, lng: -44.19500, nome: 'Santa Clara' },
      { lat: -2.59800, lng: -44.19200, nome: 'Santa Efigênia' },
      { lat: -2.58500, lng: -44.20800, nome: 'São Cristóvão' },
      { lat: -2.58200, lng: -44.19800, nome: 'São Raimundo' },
      { lat: -2.60200, lng: -44.18800, nome: 'Tajaçuaba' },
      { lat: -2.60500, lng: -44.18000, nome: 'Tajipuru' },
      { lat: -2.59942, lng: -44.18301, nome: 'Tibiri' },
      { lat: -2.60050, lng: -44.20500, nome: 'Vila Cascavel' },
      { lat: -2.59100, lng: -44.17800, nome: 'Vila Janaína' },
      { lat: -2.60400, lng: -44.19500, nome: 'Vila Magril' },
    ],
  }),

  // —— Região metropolitana ——
  z(47, 'São José de Ribamar', ['São José de Ribamar'], -2.5619, -44.0542, { radiusMeters: 8000 }),
  z(93, 'Paço do Lumiar', ['Paço do Lumiar', 'Raposa'], -2.5167, -44.1000, { radiusMeters: 9000 }),

  // —— Interior 4–46 ——
  z(4, 'Caxias', ['Caxias'], -4.8589, -43.3561),
  z(5, 'Caxias', ['Aldeias Altas'], -4.6278, -43.4689),
  z(6, 'Caxias', ['Senador Alexandre Costa', 'São João do Soter'], -4.8700, -43.4000),
  z(7, 'Codó', ['Codó', 'Timbiras'], -4.4553, -43.8856),
  z(8, 'Coroatá', ['Coroatá', 'Peritoró'], -4.1300, -44.1242),
  z(9, 'Pedreiras', ['Pedreiras', 'Trizidela do Vale'], -4.5747, -44.6000),
  z(11, 'Alto Parnaíba', ['Alto Parnaíba', 'Tasso Fragoso'], -9.1100, -45.9300),
  z(12, 'Araioses', ['Araioses', 'Água Doce do Maranhão'], -2.8900, -41.9000),
  z(13, 'Bacabal', ['Bacabal'], -4.2917, -44.7917),
  z(14, 'Cururupu', ['Cururupu'], -1.8283, -44.8683),
  z(15, 'Grajaú', ['Grajaú', 'Itaipava do Grajaú'], -5.8194, -46.1386),
  z(16, 'Itapecuru Mirim', ['Itapecuru Mirim'], -3.3928, -44.3589),
  z(17, 'Pastos Bons', ['Benedito Leite', 'Nova Iorque', 'Pastos Bons'], -6.6028, -44.0742),
  z(18, 'Rosário', ['Bacabeira', 'Rosário', 'Santa Rita'], -2.9406, -44.2411),
  z(19, 'Timon', ['Timon'], -5.0942, -42.8361),
  z(20, 'Viana', ['Cajari', 'Viana'], -3.2203, -45.0036),
  z(21, 'Barão de Grajaú', ['Barão de Grajaú', 'São Francisco do Maranhão'], -6.7500, -43.0417),
  z(22, 'Balsas', ['Balsas'], -7.5325, -46.0356),
  z(23, 'Barra do Corda', ['Barra do Corda'], -5.5056, -45.2369),
  z(24, 'Brejo', ['Anapurus', 'Brejo', 'Milagres do Maranhão', 'Santa Quitéria do Maranhão'], -3.6850, -42.7500),
  z(25, 'Buriti', ['Buriti'], -3.9417, -42.9250),
  z(26, 'Carolina', ['Carolina'], -7.3358, -47.4694),
  z(27, 'Arari', ['Arari'], -3.4536, -44.7800),
  z(28, 'Coelho Neto', ['Afonso Cunha', 'Coelho Neto', 'Duque Bacelar'], -4.2569, -43.0128),
  z(29, 'Colinas', ['Colinas', 'Jatobá'], -6.0258, -44.2492),
  z(30, 'Guimarães', ['Cedral', 'Central do Maranhão', 'Guimarães', 'Mirinzal', 'Porto Rico do Maranhão'], -2.1333, -44.6000),
  z(31, 'Icatu', ['Axixá', 'Icatu'], -2.7758, -44.0658),
  z(32, 'Humberto de Campos', ['Humberto de Campos', 'Primeira Cruz', 'Santo Amaro do Maranhão'], -2.5983, -43.4611),
  z(33, 'Imperatriz', ['Imperatriz'], -5.5189, -47.4778),
  z(34, 'São Raimundo das Mangabeiras', ['Sambaíba', 'São Raimundo das Mangabeiras'], -7.0219, -45.4808),
  z(35, 'São Luís Gonzaga do Maranhão', ['Alto Alegre do Maranhão', 'São Luís Gonzaga do Maranhão'], -4.3858, -44.6700),
  z(36, 'Parnarama', ['Parnarama'], -5.6819, -43.0931),
  z(37, 'Pinheiro', ['Pinheiro'], -2.5219, -45.0828),
  z(38, 'São Bento', ['Bacurituba', 'Palmeirândia', 'São Bento'], -2.6958, -44.8211),
  z(39, 'Turiaçu', ['Turiaçu'], -1.6631, -45.3719),
  z(40, 'Tutóia', ['Paulino Neves', 'Tutóia'], -2.7619, -42.2744),
  z(41, 'Vitória do Mearim', ['Vitória do Mearim'], -3.4622, -44.8708),
  z(42, 'Chapadinha', ['Chapadinha', 'Mata Roma'], -3.7419, -43.3603),
  z(43, 'Pindaré-Mirim', ['Monção', 'Pindaré-Mirim'], -3.6081, -45.3431),
  z(44, 'Passagem Franca', ['Buriti Bravo', 'Lagoa do Mato', 'Passagem Franca'], -6.1800, -43.7800),
  z(45, 'Penalva', ['Penalva'], -3.2942, -45.1736),
  z(46, 'Porto Franco', ['Campestre do Maranhão', 'Lajeado Novo', 'Porto Franco', 'São João do Paraíso'], -6.3383, -47.3992),

  // —— Interior 48–75 ——
  z(48, 'Dom Pedro', ['Dom Pedro', 'Governador Archer'], -5.0375, -44.4417),
  z(49, 'Vitorino Freire', ['Altamira do Maranhão', 'Brejo de Areia', 'Vitorino Freire'], -4.3700, -45.2500),
  z(50, 'Vargem Grande', ['Nina Rodrigues', 'Presidente Vargas', 'Vargem Grande'], -3.5431, -43.9158),
  z(51, 'São Bernardo', ['Magalhães de Almeida', 'Santana do Maranhão', 'São Bernardo'], -3.3611, -42.4178),
  z(52, 'Alcântara', ['Alcântara'], -2.4089, -44.4150),
  z(53, 'São João dos Patos', ['Paraibano', 'Sucupira do Riachão', 'São João dos Patos'], -6.4950, -43.7031),
  z(54, 'Presidente Dutra', ['Joselândia', 'Presidente Dutra', 'São José dos Basílios'], -5.2900, -44.4900),
  z(55, 'Carutapera', ['Carutapera', 'Luís Domingues'], -1.2000, -46.0200),
  z(56, 'Barreirinhas', ['Barreirinhas'], -2.7489, -42.8331),
  z(57, 'Santa Inês', ['Santa Inês'], -3.6667, -45.3800),
  z(58, 'João Lisboa', ['Buritirana', 'João Lisboa', 'Senador La Rocque'], -5.4450, -47.4050),
  z(60, 'São Domingos do Maranhão', ['Fortuna', 'Governador Luiz Rocha', 'São Domingos do Maranhão'], -5.5758, -44.3850),
  z(61, 'Esperantinópolis', ['Esperantinópolis', 'Poção de Pedras', 'São Raimundo do Doca Bezerra', 'São Roberto'], -4.8794, -44.9081),
  z(62, 'Loreto', ['Loreto', 'São Domingos do Azeitão', 'São Félix de Balsas'], -7.0811, -45.1411),
  z(63, 'São João Batista', ['Cajapió', 'São João Batista', 'São Vicente Ferrer'], -2.9550, -44.8069),
  z(64, 'Cândido Mendes', ['Amapá do Maranhão', 'Cândido Mendes', 'Godofredo Viana'], -1.4467, -45.7167),
  z(65, 'Imperatriz', ['Davinópolis', 'Imperatriz'], -5.5300, -47.4900),
  z(66, 'Bacabal', ['Bom Lugar', 'Conceição do Lago-Açu', 'Lago Verde'], -4.3000, -44.8500),
  z(67, 'Pedreiras', ['Bernardo do Mearim', 'Igarapé Grande', 'Lima Campos'], -4.5800, -44.6200),
  z(68, 'Cantanhede', ['Cantanhede', 'Matões do Norte', 'Pirapemas'], -3.6333, -44.3767),
  z(69, 'Santo Antônio dos Lopes', ['Capinzal do Norte', 'Santo Antônio dos Lopes'], -4.8667, -44.3667),
  z(70, 'Santa Luzia', ['Alto Alegre do Pindaré', 'Santa Luzia'], -4.0689, -45.6900),
  z(71, 'Açailândia', ['Açailândia'], -4.9472, -47.5047),
  z(72, 'Mirador', ['Mirador', 'Sucupira do Norte'], -6.3708, -44.3631),
  z(73, 'Urbano Santos', ['Belágua', 'São Benedito do Rio Preto', 'Urbano Santos'], -3.2078, -43.4039),
  z(74, 'Lago da Pedra', ['Lago da Pedra', 'Lago do Junco', 'Lago dos Rodrigues', 'Lagoa Grande do Maranhão'], -4.3333, -45.1667),
  z(75, 'Riachão', ['Feira Nova do Maranhão', 'Riachão'], -7.3619, -46.6228),

  // —— Interior 77–111 ——
  z(77, 'Santa Inês', ['Bela Vista do Maranhão', 'Igarapé do Meio', 'Tufilândia'], -3.6800, -45.4000),
  z(78, 'Bom Jardim', ['Bom Jardim', 'São João do Carú'], -3.5414, -45.6061),
  z(79, 'Tuntum', ['Santa Filomena do Maranhão', 'Tuntum'], -5.2581, -44.6489),
  z(80, 'Santa Luzia do Paruá', ['Nova Olinda do Maranhão', 'Presidente Médici', 'Santa Luzia do Paruá'], -2.5111, -45.7800),
  z(81, 'Matões', ['Matões'], -5.5200, -43.0489),
  z(82, 'Estreito', ['Estreito', 'São Pedro dos Crentes'], -6.5608, -47.4431),
  z(83, 'Santa Helena', ['Santa Helena', 'Turilândia'], -2.2311, -45.3000),
  z(84, 'São Mateus do Maranhão', ['São Mateus do Maranhão'], -4.0450, -44.4700),
  z(86, 'Matinha', ['Matinha', 'Olinda Nova do Maranhão'], -3.1006, -45.0350),
  z(87, "Olho d'Água das Cunhãs", ["Olho d'Água das Cunhãs", 'Pio XII', 'Satubinha'], -4.1361, -45.1167),
  z(92, 'São Pedro da Água Branca', ['São Pedro da Água Branca', 'Vila Nova dos Martírios'], -5.2131, -48.2492),
  z(95, 'Buriticupu', ['Bom Jesus das Selvas', 'Buriticupu'], -4.3472, -46.4069),
  z(96, 'Zé Doca', ['Araguanã', 'Governador Newton Bello', 'Zé Doca'], -3.2700, -45.6550),
  z(97, 'Barra do Corda', ['Fernando Falcão', 'Jenipapo dos Vieiras'], -5.5200, -45.2500),
  z(98, 'Açailândia', ['Cidelândia', 'Itinga do Maranhão', 'São Francisco do Brejão'], -4.9600, -47.5200),
  z(99, 'Amarante do Maranhão', ['Amarante do Maranhão', 'Sítio Novo'], -5.5667, -46.7420),
  z(100, 'Maracaçumé', ['Boa Vista do Gurupi', 'Centro Novo do Maranhão', 'Junco do Maranhão', 'Maracaçumé'], -2.0492, -45.9589),
  z(101, 'Governador Nunes Freire', ['Centro do Guilherme', 'Governador Nunes Freire', 'Maranhãozinho'], -2.0989, -45.8770),
  z(102, 'Paulo Ramos', ['Marajá do Sena', 'Paulo Ramos'], -4.4450, -45.2400),
  z(103, 'Montes Altos', ['Governador Edison Lobão', 'Montes Altos', 'Ribamar Fiquene'], -5.8300, -47.0670),
  z(104, 'Arame', ['Arame'], -4.8700, -46.0030),
  z(105, 'Balsas', ['Formosa da Serra Negra', 'Fortaleza dos Nogueiras', 'Nova Colinas'], -7.5400, -46.0400),
  z(106, 'Pinheiro', ['Pedro do Rosário', 'Presidente Sarney'], -2.5300, -45.0900),
  z(107, 'Bacuri', ['Apicum-Açu', 'Bacuri', 'Serrano do Maranhão'], -1.6967, -45.1330),
  z(108, 'Governador Eugênio Barros', ['Gonçalves Dias', 'Governador Eugênio Barros', 'Graça Aranha'], -5.3200, -44.2500),
  z(109, 'Itapecuru Mirim', ['Anajatuba', 'Miranda do Norte'], -3.4000, -44.3600),
  z(110, 'Morros', ['Cachoeira Grande', 'Morros', 'Presidente Juscelino'], -2.8639, -44.0400),
  z(111, 'Bequimão', ['Bequimão', 'Peri Mirim'], -2.4489, -44.7820),
]

const BY_NUM = new Map(ZONAS_ELEITORAIS_MA.map((z) => [z.numero, z]))

export function getZonaEleitoral(zona: string): ZonaEleitoralMA | null {
  const raw = String(zona ?? '').replace(/\D/g, '')
  if (!raw) return null
  const padded = raw.padStart(3, '0')
  return BY_NUM.get(padded) ?? BY_NUM.get(raw) ?? null
}

export function listZonasEleitorais(): ZonaEleitoralMA[] {
  return ZONAS_ELEITORAIS_MA
}
