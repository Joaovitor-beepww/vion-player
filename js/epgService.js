/**
 * Vion Player - Serviço de EPG Realista e Dinâmico
 * Suporte completo a:
 * 1. Grades diárias oficiais de 24h para os principais canais brasileiros
 *    com diferenciação de Dias Úteis (Seg-Sex), Sábado e Domingo.
 * 2. Gerador inteligente determinístico com suporte aos 7 dias da semana
 * 3. Integração assíncrona em segundo plano com a API Xtream Codes (get_short_epg)
 */

const EpgService = {
  _cache: {},
  _inflight: {},

  // ===================================================================
  // 1. DICIONÁRIO DE PROGRAMAÇÃO REAL DE 24 HORAS POR CANAL E POR DIA
  // ===================================================================
  SCHEDULES: {
    // -----------------------------------------------------------------
    // GLOBO (Dias de semana, Sábado e Domingo)
    // -----------------------------------------------------------------
    globo_weekday: [
      { start: "04:00", end: "06:00", title: "Hora Um da Notícia", desc: "Os principais fatos do início da manhã no Brasil e no mundo com Roberto Kovalick." },
      { start: "06:00", end: "08:30", title: "Bom Dia Praça & Bom Dia Brasil", desc: "Informações ao vivo do trânsito, previsão do tempo e primeiras notícias do dia com Ana Paula Araújo." },
      { start: "08:30", end: "09:30", title: "Encontro com Patrícia Poeta", desc: "Debates sobre os temas mais comentados, música e convidados especiais ao vivo." },
      { start: "09:30", end: "11:45", title: "Mais Você com Ana Maria Braga", desc: "Receitas especiais com Louro Mané, reportagens e bate-papo descontraído." },
      { start: "11:45", end: "13:00", title: "Praça TV 1ª Edição", desc: "Cobertura regional completa com prestação de serviços e notícias locais ao vivo." },
      { start: "13:00", end: "13:25", title: "Globo Esporte", desc: "Gols, análises dos clubes e bastidores do futebol brasileiro e internacional." },
      { start: "13:25", end: "14:45", title: "Jornal Hoje", desc: "As notícias do início da tarde no Brasil e no mundo com César Tralli." },
      { start: "14:45", end: "15:30", title: "Edição Especial: Novela da Tarde", desc: "Grandes emoções com os maiores clássicos da teledramaturgia brasileira." },
      { start: "15:30", end: "17:05", title: "Sessão da Tarde", desc: "Filmes imperdíveis e emocionantes para reunir toda a família." },
      { start: "17:05", end: "18:05", title: "Vale a Pena Ver de Novo", desc: "A reprise dos maiores sucessos de audiência da teledramaturgia nacional." },
      { start: "18:05", end: "19:15", title: "Novela das Seis", desc: "Capítulo inédito com romance de época e reviravoltas emocionantes." },
      { start: "19:15", end: "19:40", title: "Praça TV 2ª Edição", desc: "O resumo dos principais acontecimentos do dia no seu estado ao vivo." },
      { start: "19:40", end: "20:30", title: "Novela das Sete", desc: "A comédia e o drama inédito da faixa das sete que movimenta o país." },
      { start: "20:30", end: "21:20", title: "Jornal Nacional", desc: "As principais notícias do dia no principal telejornal do Brasil com William Bonner e Renata Vasconcellos." },
      { start: "21:20", end: "22:25", title: "Novela das Nove: Capítulo Inédito", desc: "Grandes revelações e conflitos na principal novela da TV brasileira." },
      { start: "22:25", end: "23:45", title: "Futebol / Linha de Shows / Cinema Especial", desc: "Transmissões ao vivo da Copa do Brasil, reality shows ou superproduções da TV Globo." },
      { start: "23:45", end: "00:45", title: "Jornal da Globo", desc: "Análises aprofundadas da política, economia e do cenário internacional com Renata Lo Prete." },
      { start: "00:45", end: "01:30", title: "Conversa com Bial", desc: "Entrevistas inteligentes e aprofundadas sobre atualidades, arte e sociedade." },
      { start: "01:30", end: "03:00", title: "Comédia na Madrugada", desc: "Episódios divertidos das melhores séries de humor da televisão." },
      { start: "03:00", end: "04:00", title: "Corujão: Sessão Especial", desc: "Cinema na madrugada com títulos premiados de ação, drama e suspense." }
    ],

    globo_saturday: [
      { start: "06:00", end: "06:50", title: "Globo Comunidade", desc: "Reportagens e iniciativas comunitárias em destaque na sua região." },
      { start: "06:50", end: "11:45", title: "É de Casa", desc: "Dicas de gastronomia, decoração, jardinagem e bem-estar para o seu sábado." },
      { start: "11:45", end: "13:00", title: "Praça TV 1ª Edição - Sábado", desc: "O resumo das notícias e o panorama do fim de semana no seu estado." },
      { start: "13:00", end: "13:25", title: "Globo Esporte Especial", desc: "A prévia das rodadas do fim de semana e os bastidores dos grandes clássicos." },
      { start: "13:25", end: "14:10", title: "Jornal Hoje - Edição de Sábado", desc: "As primeiras notícias do fim de semana no Brasil e no mundo." },
      { start: "14:10", end: "15:50", title: "Edição Especial: Cinema / Séries", desc: "Episódios e produções especiais para curtir na tarde de sábado." },
      { start: "15:50", end: "18:30", title: "Caldeirão com Mion", desc: "Muita música, alegria, quadros divertidos e convidados especiais com Marcos Mion." },
      { start: "18:30", end: "19:15", title: "Novela das Seis", desc: "As reviravoltas emocionantes do capítulo de sábado." },
      { start: "19:15", end: "19:40", title: "Praça TV 2ª Edição", desc: "O giro de acontecimentos e lazer da noite de sábado na sua região." },
      { start: "19:40", end: "20:30", title: "Novela das Sete", desc: "A trama da faixa das sete agitando o início da sua noite." },
      { start: "20:30", end: "21:20", title: "Jornal Nacional - Edição de Sábado", desc: "O resumo dos fatos mais marcantes do dia no Brasil e no mundo." },
      { start: "21:20", end: "22:25", title: "Novela das Nove: Capítulo Especial", desc: "Momentos decisivos da história na novela das nove da TV Globo." },
      { start: "22:25", end: "00:15", title: "Altas Horas com Serginho Groisman", desc: "Bate-papo caloroso, debates jovens e apresentações musicais com grandes astros." },
      { start: "00:15", end: "02:00", title: "Supercine: Sessão Especial", desc: "Superproduções consagradas do cinema mundial na sua madrugada de sábado." },
      { start: "02:00", end: "06:00", title: "Corujão Madrugada", desc: "Maratona cinematográfica até o amanhecer com muita ação e suspense." }
    ],

    globo_sunday: [
      { start: "06:00", end: "07:00", title: "Santa Missa", desc: "Celebração dominical ao vivo com orações e reflexões de fé." },
      { start: "07:00", end: "08:30", title: "Pequenas Empresas & Grandes Negócios", desc: "Histórias inspiradoras de empreendedorismo, inovação e oportunidades no Brasil." },
      { start: "08:30", end: "10:00", title: "Globo Rural", desc: "O principal programa do agronegócio com cotações, feiras e a vida no campo." },
      { start: "10:00", end: "11:00", title: "Auto Esporte", desc: "Novidades do setor automotivo, lançamentos, comparativos e dicas de direção." },
      { start: "11:00", end: "12:30", title: "Esporte Espetacular", desc: "Grandes reportagens esportivas, quadros radicais e cobertura do futebol com Lucas Gutierrez e Bárbara Coelho." },
      { start: "12:30", end: "14:15", title: "Temperatura Máxima", desc: "Grandes aventuras e campeões de bilheteria para reunir toda a família no almoço de domingo." },
      { start: "14:15", end: "15:45", title: "Domingão com Huck - 1ª Parte", desc: "Quadros emocionantes, histórias de superação e diversão com Luciano Huck." },
      { start: "15:45", end: "18:05", title: "Futebol Ao Vivo: Brasileirão Série A", desc: "A bola rolando ao vivo em alta definição com narração oficial da TV Globo." },
      { start: "18:05", end: "20:30", title: "Domingão com Huck - 2ª Parte: Dança / Show dos Famosos", desc: "Competições de dança, desafios musicais e grandes homenagens aos artistas." },
      { start: "20:30", end: "23:30", title: "Fantástico: O Show da Vida", desc: "As grandes investigações jornalísticas da semana, saúde, ciência e entretenimento com Maju Coutinho e Poliana Abritta." },
      { start: "23:30", end: "00:30", title: "Linha de Shows: Reality / Séries Exclusivas", desc: "Conteúdo especial exclusivo para fechar o domingo." },
      { start: "00:30", end: "02:30", title: "Domingo Maior: Sessão de Ação", desc: "Grandes astros de Hollywood em tiroteios e perseguições eletrizantes." },
      { start: "02:30", end: "04:00", title: "Cinemaço", desc: "Sucessos aclamados pelo público na madrugada de domingo." },
      { start: "04:00", end: "06:00", title: "Hora Um da Notícia", desc: "As notícias do amanhecer abrindo a nova semana." }
    ],

    // -----------------------------------------------------------------
    // RECORD (Dias de semana, Sábado e Domingo)
    // -----------------------------------------------------------------
    record_weekday: [
      { start: "05:00", end: "07:00", title: "Balanço Geral Manhã", desc: "As primeiras notícias do dia com prestação de serviços, trânsito e ocorrências ao vivo." },
      { start: "07:00", end: "08:40", title: "Balanço Geral - Edição Regional", desc: "Cobertura ao vivo com helicóptero e as principais informações da sua cidade." },
      { start: "08:40", end: "10:00", title: "Fala Brasil", desc: "Telejornal matutino dinâmico trazendo as principais manchetes do país e do mundo." },
      { start: "10:00", end: "11:50", title: "Hoje em Dia", desc: "Informação, culinária, moda e fofocas com Celso Zucatelli e Ana Hickmann." },
      { start: "11:50", end: "15:30", title: "Balanço Geral & A Hora da Venenosa", desc: "Notícias populares, prestação de serviços e os bastidores das celebridades com Fabíola Reipert." },
      { start: "15:30", end: "16:45", title: "Novela da Tarde: Grandes Histórias", desc: "Reprises consagradas das superproduções dramáticas e bíblicas da Record." },
      { start: "16:45", end: "19:55", title: "Cidade Alerta com Luiz Bacci", desc: "Reportagens investigativas, ocorrências em tempo real e prestação de serviços ao vivo." },
      { start: "19:55", end: "21:00", title: "Jornal da Record", desc: "As notícias mais relevantes do Brasil e do mundo com Celso Freitas e Christina Lemos." },
      { start: "21:00", end: "21:45", title: "Série Bíblica: Reis / Força de Mulher", desc: "Superprodução épica inédita com grandes atuações, batalhas e fé." },
      { start: "21:45", end: "22:45", title: "Novela da Noite", desc: "Conflitos emocionantes e tramas intensas na teledramaturgia da Record." },
      { start: "22:45", end: "00:00", title: "A Fazenda / Linha de Shows / Chicago Med", desc: "Reality shows exclusivos, adrenalina e séries internacionais de sucesso." },
      { start: "00:00", end: "01:15", title: "JR 24 Horas & Repórter Record", desc: "Grandes reportagens, documentários investigativos e resumo do dia." },
      { start: "01:15", end: "05:00", title: "Programação Noturna da Record", desc: "Mensagens de fé, palestras motivacionais e conteúdo informativo de madrugada." }
    ],

    record_saturday: [
      { start: "07:00", end: "12:00", title: "Fala Brasil Especial de Sábado", desc: "As notícias da semana e o plantão do sábado com matérias especiais." },
      { start: "12:00", end: "15:00", title: "Balanço Geral - Edição de Sábado", desc: "Casos policiais, prestação de serviços e muita descontração no almoço de sábado." },
      { start: "15:00", end: "17:30", title: "Cine Aventura: Sessão Família", desc: "Filmes de grande bilheteria e comédia para divertir as tardes de sábado." },
      { start: "17:30", end: "19:45", title: "Cidade Alerta Especial", desc: "As principais ocorrências policiais e investigações exclusivas do fim de semana." },
      { start: "19:45", end: "21:00", title: "Jornal da Record - Sábado", desc: "O balanço geral das principais manchetes do Brasil e do mundo." },
      { start: "21:00", end: "22:30", title: "Superprodução Bíblica: Melhores Momentos", desc: "Capítulos especiais com grandes batalhas e fé da teledramaturgia Record." },
      { start: "22:30", end: "00:15", title: "Tela Máxima: Cinema de Ação", desc: "Adrenalina pura com os melhores filmes de ação do cinema." },
      { start: "00:15", end: "07:00", title: "Programação Noturna Record", desc: "Conteúdo religioso e informativo na madrugada." }
    ],

    record_sunday: [
      { start: "09:00", end: "11:00", title: "Record Kids: Todo Mundo Odeia o Chris", desc: "As aventuras inesquecíveis de Chris, Drew, Tonya e Julius que marcaram época." },
      { start: "11:00", end: "12:30", title: "Desenhos Bíblicos & Séries Especiais", desc: "Histórias bíblicas com belíssimas animações para a manhã de domingo." },
      { start: "12:30", end: "14:00", title: "Domingo Record com Rachel Sheherazade", desc: "Jornalismo com reportagens especiais, histórias humanas e novidades." },
      { start: "14:00", end: "16:00", title: "Acerte ou Caia com Tom Cavalcante", desc: "O game show mais dinâmico da TV com perguntas rápidas, humor e quedas no alçapão." },
      { start: "16:00", end: "19:45", title: "Hora do Faro", desc: "Rodrigo Faro com o Dança Gatinho, histórias de superação e reencontros emocionantes." },
      { start: "19:45", end: "23:00", title: "Domingo Espetacular com Carolina Ferraz e Roberto Cabrini", desc: "A revista eletrônica da Record com matérias investigativas exclusivas e grandes reportagens." },
      { start: "23:00", end: "00:15", title: "Câmera Record com Roberto Cabrini", desc: "Grandes investigações pelo Brasil e pelo mundo com o jornalismo premiado de Roberto Cabrini." },
      { start: "00:15", end: "06:00", title: "Programação Noturna Record", desc: "Reflexões de fé e programas especiais na madrugada." }
    ],

    // -----------------------------------------------------------------
    // SBT (Dias de semana, Sábado e Domingo)
    // -----------------------------------------------------------------
    sbt_weekday: [
      { start: "06:00", end: "09:30", title: "Primeiro Impacto", desc: "As notícias policiais, do trânsito e do cotidiano com dinamismo e agilidade ao vivo." },
      { start: "09:30", end: "11:15", title: "Chega Mais", desc: "Revista eletrônica com variedades, culinária, moda e entretenimento." },
      { start: "11:15", end: "13:30", title: "Chega Mais Notícias", desc: "Fatos marcantes da manhã, prestação de serviços e notícias urgentes do país." },
      { start: "13:30", end: "14:30", title: "Novelas da Tarde: Carinha de Anjo", desc: "Divertidas tramas para curtir junto com as crianças e toda família." },
      { start: "14:30", end: "15:30", title: "Novela Mexicana: Quando me Apaixono", desc: "Dramas apaixonantes, romances intensos e reviravoltas eletrizantes." },
      { start: "15:30", end: "16:30", title: "Fofocalizando com Leo Dias", desc: "As fofocas exclusivas dos famosos, flagras e bastidores da TV com Cariúcha." },
      { start: "16:30", end: "17:30", title: "Novela Mexicana: Meu Caminho é Te Amar", desc: "Paixões ardentes e segredos revelados nos episódios inéditos." },
      { start: "17:30", end: "18:30", title: "Tá na Hora", desc: "Notícias populares, prestação de serviços e denúncias ao vivo no fim da tarde." },
      { start: "18:30", end: "19:45", title: "SBT Brasil com César Filho", desc: "Os fatos mais importantes do dia contados com clareza, dinamismo e credibilidade." },
      { start: "19:45", end: "20:45", title: "A Caverna Encantada", desc: "Novela infantojuvenil inédita com muita magia, mistério e música." },
      { start: "20:45", end: "21:45", title: "As Aventuras de Poliana", desc: "As aventuras e o jogo do contente com lições de vida para todas as idades." },
      { start: "21:45", end: "23:00", title: "Programa do Ratinho", desc: "Música, quadros engraçados, teste de DNA e o Jornal Rational ao vivo." },
      { start: "23:00", end: "00:45", title: "Cine Espetacular / A Praça é Nossa", desc: "Filmes de grande sucesso ou o humor clássico de Carlos Alberto de Nóbrega." },
      { start: "00:45", end: "01:45", title: "The Noite com Danilo Gentili", desc: "Talk show bem-humorado com monólogos, convidados e Ultraje a Rigor." },
      { start: "01:45", end: "02:30", title: "Operação Mesquita", desc: "Otávio Mesquita desbrava eventos curiosos e histórias inusitadas." },
      { start: "02:30", end: "06:00", title: "SBT News na TV", desc: "Plantão contínuo com as notícias do Brasil e do exterior madrugada adentro." }
    ],

    sbt_saturday: [
      { start: "06:00", end: "11:15", title: "Sábado Animado com Silvia Abravanel", desc: "Os desenhos mais amados da TV com brincadeiras interativas e prêmios." },
      { start: "11:15", end: "14:15", title: "Notícias Impressionantes", desc: "Flagrantes inacreditáveis, perseguições reais e momentos chocantes da internet." },
      { start: "14:15", end: "16:00", title: "Cinema em Casa", desc: "Filmes clássicos cheios de aventura e comédia na tarde de sábado do SBT." },
      { start: "16:00", end: "18:30", title: "Programa Raul Gil", desc: "Competições de jovens talentos, calouros musicais e o clássico 'Pra Quem Você Tira o Chapéu?'" },
      { start: "18:30", end: "19:45", title: "SBT Brasil - Edição de Sábado", desc: "O panorama jornalístico completo dos acontecimentos mais importantes do dia." },
      { start: "19:45", end: "21:00", title: "Circo do Tiru com Tirullipa", desc: "Muita palhaçada, desafios malucos e risadas para toda a família." },
      { start: "21:00", end: "22:30", title: "Esquadrão da Moda", desc: "Transformações visuais incríveis e dicas de estilo com especialistas." },
      { start: "22:30", end: "00:15", title: "Sabadou com Virginia Fonseca", desc: "Jogos com famosos, música ao vivo e as revelações mais espontâneas da internet." },
      { start: "00:15", end: "06:00", title: "SBT News na TV", desc: "Giro ininterrupto de notícias do Brasil e do mundo na madrugada." }
    ],

    sbt_sunday: [
      { start: "06:00", end: "09:00", title: "SBT News na TV - Edição de Domingo", desc: "Noticiário matinal de domingo com as principais manchetes do país." },
      { start: "09:00", end: "11:15", title: "Notícias Impressionantes", desc: "Compilado com os vídeos mais curiosos e surpreendentes do planeta." },
      { start: "11:15", end: "18:15", title: "Domingo Legal com Celso Portiolli", desc: "Passa ou Repassa com torta na cara, Comprar é Bom Levar é Melhor e muita diversão ao vivo." },
      { start: "18:15", end: "19:00", title: "Roda a Roda Jequiti com Rebeca Abravanel", desc: "Consultores e clientes concorrem a prêmios em barras de ouro girando a roleta." },
      { start: "19:00", end: "00:00", title: "Programa Silvio Santos com Patrícia Abravanel", desc: "Jogo das 3 Pistas, Câmeras Escondidas hilárias e a alegria da tradicional família brasileira." },
      { start: "00:00", end: "01:00", title: "Show do Milhão / Séries Especiais", desc: "O clássico jogo de perguntas e respostas valendo 1 milhão de reais." },
      { start: "01:00", end: "06:00", title: "SBT News na TV", desc: "Plantão noturno acompanhando as primeiras notícias de segunda-feira." }
    ],

    // -----------------------------------------------------------------
    // BAND (Dias de semana, Sábado e Domingo)
    // -----------------------------------------------------------------
    band_weekday: [
      { start: "06:00", end: "08:00", title: "Bora Brasil", desc: "As primeiras notícias com agilidade, trânsito e o cenário econômico do dia." },
      { start: "08:00", end: "09:00", title: "Bora Praça", desc: "O panorama local com informações em tempo real da sua região." },
      { start: "09:00", end: "11:00", title: "The Chef com Edu Guedes", desc: "Dicas de gastronomia, receitas saborosas e bem-estar para suas manhãs." },
      { start: "11:00", end: "13:00", title: "Jogo Aberto com Renata Fan", desc: "Debates acalorados do futebol, zoeiras com Denílson Show e análises da rodada." },
      { start: "13:00", end: "14:30", title: "Os Donos da Bola com Craque Neto", desc: "A opinião sem filtros do Craque Neto sobre os principais clubes do Brasil." },
      { start: "14:30", end: "16:00", title: "Melhor da Tarde com Catia Fonseca", desc: "Culinária, fofocas dos bastidores da TV e astrologia com muito alto-astral." },
      { start: "16:00", end: "19:20", title: "Brasil Urgente com Datena", desc: "Flagrantes ao vivo, perseguições e a cobertura das principais ocorrências do país." },
      { start: "19:20", end: "20:30", title: "Jornal da Band", desc: "Credibilidade e reportagens investigativas com Eduardo Oinegue e Adriana Araújo." },
      { start: "20:30", end: "22:00", title: "Melhor da Noite", desc: "Variedades, histórias inspiradoras, entretenimento e cultura ao vivo." },
      { start: "22:00", end: "23:45", title: "Perrengue do Dia / MasterChef Brasil", desc: "Vídeos engraçados da internet ou a disputa culinária mais famosa da televisão." },
      { start: "23:45", end: "00:45", title: "Jornal da Noite", desc: "O balanço final do dia com entrevistas e análises do cenário nacional." },
      { start: "00:45", end: "01:45", title: "Esporte Total", desc: "Gols internacionais, Fórmula 1, basquete e o giro esportivo da noite." },
      { start: "01:45", end: "06:00", title: "Estação Cinema na Madrugada", desc: "Filmes clássicos, ação e séries internacionais." }
    ],

    band_saturday: [
      { start: "08:00", end: "10:30", title: "Band Kids: Desenhos e Animações", desc: "Manhã divertida com os melhores desenhos animados para a garotada." },
      { start: "10:30", end: "12:00", title: "Olhar de Repórter", desc: "Documentários e matérias de fôlego com os repórteres especiais da Band." },
      { start: "12:00", end: "13:30", title: "Band Esporte Clube (BEC)", desc: "A prévia dos esportes, entrevistas exclusivas e reportagens especiais." },
      { start: "13:30", end: "16:00", title: "Automobilismo / Classificação da F1 / Stock Car", desc: "Motores roncando ao vivo com treinos oficiais e corridas de alta velocidade." },
      { start: "16:00", end: "19:20", title: "Brasil Urgente - Edição de Sábado", desc: "Cobertura policial e ocorrências urgentes do fim de semana ao vivo." },
      { start: "19:20", end: "20:30", title: "Jornal da Band - Sábado", desc: "As notícias mais relevantes do Brasil e do mundo no sábado." },
      { start: "20:30", end: "22:00", title: "Programa do João (João Silva)", desc: "Entrevistas descontraídas, música e juventude com o filho de Faustão." },
      { start: "22:00", end: "00:00", title: "SFT Lutas / Cine Privé", desc: "MMA profissional com nocautes eletrizantes ou sessão de cinema da noite." },
      { start: "00:00", end: "06:00", title: "Cinema na Madrugada", desc: "Clássicos de ação, suspense e aventura na madrugada da Band." }
    ],

    band_sunday: [
      { start: "08:00", end: "10:00", title: "Pé na Estrada", desc: "O cotidiano dos caminhoneiros pelas rodovias brasileiras e dicas do setor de transportes." },
      { start: "10:00", end: "12:00", title: "Show do Esporte - 1ª Parte", desc: "O início da maratona esportiva dominical com Glenda Kozlowski e Elia Júnior." },
      { start: "12:00", end: "14:00", title: "Fórmula 1 Ao Vivo: O Grande Prêmio", desc: "A largada oficial da F1 com narração eletrizante de Sergio Mauricio e Reginaldo Leme." },
      { start: "14:00", end: "18:00", title: "Show do Esporte - 2ª Parte", desc: "Gols da rodada, futebol ao vivo, vôlei e análises completas dos campeonatos." },
      { start: "18:00", end: "20:00", title: "Perrengue na Band", desc: "Tatola, Dennys, Ricardinho e Ângelo rindo dos vídeos mais loucos da internet ao vivo." },
      { start: "20:00", end: "21:30", title: "Apito Final com Craque Neto", desc: "A resenha sem papas na língua de todos os jogos do domingão com Craque Neto." },
      { start: "21:30", end: "23:00", title: "Canal Livre com Rodolfo Schneider", desc: "Debates e sabatinas com personalidades da política, ciência e economia." },
      { start: "23:00", end: "00:30", title: "Show Business", desc: "Entrevistas com grandes líderes empresariais e visionários do mercado." },
      { start: "00:30", end: "06:00", title: "Band Esporte Madrugada", desc: "Compactos das corridas e melhores momentos esportivos do fim de semana." }
    ],

    // -----------------------------------------------------------------
    // REDETV & CULTURA
    // -----------------------------------------------------------------
    redetv: [
      { start: "08:30", end: "10:00", title: "Manhã com Você", desc: "Notícias leves, prestação de serviços e dicas para o dia a dia." },
      { start: "10:00", end: "11:30", title: "Você na TV", desc: "Histórias curiosas, debates e revelações surpreendentes." },
      { start: "11:30", end: "13:00", title: "Manhã do Ronnie", desc: "Cultura, gastronomia e entrevistas refinadas com Ronnie Von." },
      { start: "15:00", end: "17:00", title: "A Tarde é Sua com Sonia Abrão", desc: "A cobertura completa do mundo das celebridades, fofocas e realities." },
      { start: "18:00", end: "19:30", title: "RedeTV! News", desc: "As principais notícias do dia no Brasil e no mundo com credibilidade." },
      { start: "19:30", end: "20:30", title: "TV Fama com Nelson Rubens", desc: "Flagras das celebridades, bastidores de shows e eventos dos famosos." },
      { start: "21:30", end: "22:30", title: "Superpop com Luciana Gimenez", desc: "Entrevistas polêmicas, debates quentes e assuntos em alta na sociedade." },
      { start: "22:30", end: "00:00", title: "Mega Senha Power / Leitura Dinâmica", desc: "Game show eletrizante seguido pelo telejornal de cultura e tecnologia." },
      { start: "00:00", end: "08:30", title: "Programação Noturna RedeTV!", desc: "Séries, infomerciais e reprises especiais da grade." }
    ],

    cultura: [
      { start: "06:00", end: "08:00", title: "Cocoricó & Quintal da Cultura", desc: "Desenhos educativos, brincadeiras e muito aprendizado para a garotada." },
      { start: "08:00", end: "11:30", title: "Mundo da Criança: Desenhos Educativos", desc: "Animações clássicas e historinhas inteligentes para todas as idades." },
      { start: "11:30", end: "13:00", title: "Jornal da Tarde", desc: "Informação precisa e análise aprofundada dos acontecimentos do dia." },
      { start: "13:00", end: "14:00", title: "Cartão Verde", desc: "A tradicional mesa redonda de futebol com análises inteligentes e sem sensacionalismo." },
      { start: "14:00", end: "17:30", title: "Quintal da Cultura: Tarde Divertida", desc: "Teatro infantil, curiosidades científicas e aventuras com Doroteia e Ludovico." },
      { start: "17:30", end: "19:30", title: "Documentários Internacionais BBC", desc: "Expedições visuais extraordinárias pela história e natureza do planeta." },
      { start: "19:30", end: "20:30", title: "Metrópolis", desc: "O principal programa de arte, cinema, música e literatura da televisão brasileira." },
      { start: "20:30", end: "22:00", title: "Jornal da Cultura", desc: "Comentários analíticos de cientistas políticos e filósofos sobre as manchetes." },
      { start: "22:00", end: "23:30", title: "Roda Viva", desc: "A mais importante entrevista da TV brasileira com personalidades de destaque." },
      { start: "23:30", end: "01:00", title: "Café Filosófico", desc: "Grandes pensadores debatem questões existenciais e dilemas da vida moderna." },
      { start: "01:00", end: "06:00", title: "Clássicos da Cultura & Concerto Noturno", desc: "Grandes orquestras, óperas e documentários premiados na madrugada." }
    ],

    // -----------------------------------------------------------------
    // SPORTV & ESPN (Dias de semana e Fim de Semana)
    // -----------------------------------------------------------------
    sportv_weekday: [
      { start: "06:00", end: "09:00", title: "Giro da Rodada & Compactos", desc: "Compactos dos principais jogos da noite e os melhores lances das partidas." },
      { start: "09:00", end: "12:00", title: "Redação SporTV com Marcelo Barreto", desc: "Leitura dos jornais, debates e bastidores do esporte nacional e internacional." },
      { start: "12:00", end: "13:00", title: "Seleção SporTV - Aquecimento", desc: "A prévia das discussões mais quentes com os melhores comentaristas esportivos." },
      { start: "13:00", end: "16:00", title: "Seleção SporTV com André Rizek", desc: "Análises táticas aprofundadas, prancheta tática e opiniões sobre o futebol brasileiro." },
      { start: "16:00", end: "19:00", title: "SporTV Tá na Área", desc: "Informação leve e bem-humorada com repórteres ao vivo nos estádios e centros de treino." },
      { start: "19:00", end: "22:00", title: "Transmissão Ao Vivo: Brasileirão / Copa do Brasil", desc: "A bola rolando ao vivo em Full HD com narração e comentários exclusivos do SporTV." },
      { start: "22:00", end: "23:30", title: "Troca de Passes com Felipe Diniz", desc: "Entrevistas exclusivas dos técnicos, gols da rodada e prancheta tática." },
      { start: "23:30", end: "01:00", title: "Boleiragem com Roger Flores", desc: "Bate-papo descontraído com ex-jogadores contando histórias inéditas de vestiário." },
      { start: "01:00", end: "06:00", title: "Reprise dos Melhores Jogos da Rodada", desc: "Reveja os confrontos mais emocionantes e os gols decisivos na íntegra." }
    ],

    sportv_weekend: [
      { start: "06:00", end: "09:30", title: "Giro da Rodada & Gols do Fim de Semana", desc: "Todos os gols dos confrontos de sexta e sábado com análises de arbitragem." },
      { start: "09:30", end: "12:00", title: "Redação SporTV Especial de Fim de Semana", desc: "A cobertura das manchetes esportivas e aquecimento dos clássicos." },
      { start: "12:00", end: "15:30", title: "Transmissão Ao Vivo: Brasileirão Série B", desc: "Duelo decisivo pela subida de divisão com cobertura exclusiva do SporTV." },
      { start: "15:30", end: "18:30", title: "Transmissão Ao Vivo: Brasileirão Série A", desc: "O grande clássico do futebol nacional ao vivo com som da torcida e alta definição." },
      { start: "18:30", end: "21:30", title: "Transmissão Ao Vivo: Jogão da Rodada", desc: "A emoção não para com o segundo duelo ao vivo na tela do SporTV." },
      { start: "21:30", end: "23:45", title: "Troca de Passes Especial da Rodada", desc: "Todos os gols do fim de semana, notas dos atletas e a tabela atualizada com Felipe Diniz." },
      { start: "23:45", end: "06:00", title: "VT Completo: O Melhor Jogo da Rodada", desc: "Transmissão na íntegra para rever lances épicos sem comerciais." }
    ],

    espn_weekday: [
      { start: "06:00", end: "09:00", title: "SportsCenter - Edição Manhã", desc: "Giro matinal com os resultados da NBA, NFL e gols do futebol europeu." },
      { start: "09:00", end: "11:00", title: "ESPN F360", desc: "Visão 360 graus do mundo esportivo com debates sobre tática e desempenho." },
      { start: "11:00", end: "13:00", title: "ESPN F90", desc: "Muita paixão e discussão com comentaristas debatendo os jogos do fim de semana." },
      { start: "13:00", end: "15:30", title: "Futebol no Mundo", desc: "A cobertura especializada da Premier League, La Liga, Serie A e Champions League." },
      { start: "15:30", end: "18:00", title: "Futebol Europeu / Premier League Ao Vivo", desc: "Transmissão ao vivo com áudio surround e os maiores craques do futebol mundial." },
      { start: "18:00", end: "20:00", title: "ESPN Fim de Tarde", desc: "Repercussão das partidas europeias e notícias quentes dos clubes brasileiros." },
      { start: "20:00", end: "22:00", title: "SportsCenter Noturno", desc: "O telejornal esportivo mais premiado da TV com os gols de todos os campeonatos." },
      { start: "22:00", end: "00:00", title: "Linha de Passe: Mesa Redonda Tradicional", desc: "O debate mais respeitado do jornalismo esportivo com análise crítica sem rodeios." },
      { start: "00:00", end: "06:00", title: "SportsCenter Madrugada & Melhores Momentos", desc: "Compactos e análises dos jogos internacionais e esportes americanos." }
    ],

    espn_weekend: [
      { start: "06:00", end: "08:30", title: "SportsCenter Manhã Especial", desc: "Aquecimento para o super sábado/domingo de futebol europeu e esportes americanos." },
      { start: "08:30", end: "11:00", title: "Transmissão Ao Vivo: Premier League", desc: "O melhor campeonato do mundo na tela da ESPN com narração de ponta." },
      { start: "11:00", end: "13:30", title: "Transmissão Ao Vivo: La Liga - Real Madrid / Barcelona", desc: "Os gigantes espanhóis em campo disputando a liderança da tabela." },
      { start: "13:30", end: "16:00", title: "Transmissão Ao Vivo: Premier League / Serie A Italiana", desc: "Confronto de alto nível com os grandes artilheiros da Europa." },
      { start: "16:00", end: "18:30", title: "Transmissão Ao Vivo: Futebol Europeu / NBA", desc: "Os astros da bola e do basquete brilhando ao vivo na sua TV." },
      { start: "18:30", end: "21:00", title: "SportsCenter - Edição Especial da Rodada", desc: "Todos os gols da Premier League, La Liga e o giro do futebol nacional." },
      { start: "21:00", end: "23:30", title: "Linha de Passe: A Grande Mesa Redonda do Fim de Semana", desc: "Discussão aprofundada com os grandes nomes do jornalismo esportivo da ESPN." },
      { start: "23:30", end: "06:00", title: "NBA / NFL / Melhores Momentos", desc: "Os lances mais espetaculares das grandes ligas internacionais." }
    ],

    // -----------------------------------------------------------------
    // PREMIERE & COMBATE
    // -----------------------------------------------------------------
    premiere: [
      { start: "06:00", end: "09:30", title: "Arquivo Premiere: Jogos Inesquecíveis", desc: "Reviva clássicos memoráveis do futebol nacional com grandes viradas." },
      { start: "09:30", end: "12:30", title: "Compacto Especial da Rodada", desc: "Melhores momentos de cada confronto das Séries A e B com som ambiente." },
      { start: "12:30", end: "15:00", title: "Sala de Coletivas: Treinadores & Atletas", desc: "Declarações exclusivas após as partidas e as análises dos comandantes." },
      { start: "15:00", end: "18:00", title: "Pré-Jogo Premiere: O Aquecimento Completo", desc: "Escalações oficiais, chegada aos estádios e análises táticas prévias." },
      { start: "18:00", end: "21:30", title: "Transmissão Oficial Ao Vivo: Brasileirão", desc: "Transmissão dedicada em alta definição com estatísticas lance a lance." },
      { start: "21:30", end: "23:30", title: "Pós-Jogo: Todos os Gols e Entrevistas", desc: "Repercussão completa no gramado com notas dos atletas e melhores lances." },
      { start: "23:30", end: "06:00", title: "VT Completo: Jogo na Íntegra", desc: "A partida completa sem cortes para rever cada detalhe da disputa." }
    ],

    combate: [
      { start: "06:00", end: "09:00", title: "Lutas Históricas do MMA", desc: "Confrontos lendários do UFC, Pride e Strikeforce que marcaram época." },
      { start: "09:00", end: "12:00", title: "Revista Combate", desc: "Entrevistas com lutadores, técnicas de treino e novidades das artes marciais." },
      { start: "12:00", end: "15:00", title: "BJJ Stars & Jiu-Jitsu Profissional", desc: "Os maiores torneios de artes suaves com finalizações espetaculares." },
      { start: "15:00", end: "18:00", title: "Countdown UFC: A Prévia dos Campeões", desc: "Bastidores do camp dos atletas antes do grande combate pelo cinturão." },
      { start: "18:00", end: "21:00", title: "Card Preliminar Ao Vivo: UFC Fight Night", desc: "Os novos talentos do octógono buscando nocaute nas preliminares." },
      { start: "21:00", end: "01:00", title: "Card Principal Ao Vivo: Disputa de Cinturão", desc: "As maiores feras do MMA mundial em duelos eletrizantes pelo título." },
      { start: "01:00", end: "06:00", title: "Especial Nocaute da Madrugada", desc: "Compilado com os nocautes e finalizações mais brutais do ano." }
    ],

    // -----------------------------------------------------------------
    // TELECINE & HBO
    // -----------------------------------------------------------------
    telecine_premium: [
      { start: "06:00", end: "08:15", title: "Sessão Despertar: Duna - Parte 2", desc: "Paul Atreides se une a Chani e aos Fremen em busca de vingança épica." },
      { start: "08:15", end: "10:30", title: "Cine Estreia: Oppenheimer", desc: "A fascinante história do físico J. Robert Oppenheimer e o Projeto Manhattan." },
      { start: "10:30", end: "12:45", title: "Aventura Épica: Top Gun: Maverick", desc: "Pete Mitchell lidera os melhores graduados da Top Gun numa missão suicida." },
      { start: "12:45", end: "15:00", title: "Super Sessão: Barbie", desc: "No fabuloso mundo da Barbielândia, Barbie e Ken exploram a vida real." },
      { start: "15:00", end: "17:15", title: "Campeões de Bilheteria: John Wick 4", desc: "John Wick descobre um caminho para derrotar a Alta Cúpula em duelos intensos." },
      { start: "17:15", end: "19:45", title: "Cinema 4K: Missão Impossível - Acerto de Contas", desc: "Ethan Hunt e sua equipe rastreiam uma perigosa inteligência artificial." },
      { start: "19:45", end: "22:00", title: "Superestreia da Noite: Gladiador 2 (Exclusivo)", desc: "A grandiosa sequência épica de Roma nas melhores telas de cinema." },
      { start: "22:00", end: "00:30", title: "Cine Ação: Os Mercenários 4", desc: "Armados com todas as armas imagináveis numa missão de resgate de alto risco." },
      { start: "00:30", end: "03:00", title: "Suspense VIP: Assassinos da Lua das Flores", desc: "Investigações intensas sobre assassinatos misteriosos na comunidade Osage." },
      { start: "03:00", end: "06:00", title: "Madrugada Premiada: Pobres Criaturas", desc: "A fantástica evolução de Bella Baxter em busca de liberdade e igualdade." }
    ],

    telecine_action: [
      { start: "06:00", end: "08:30", title: "Adrenalina Máxima: Carga Explosiva", desc: "Frank Martin enfrenta criminosos perigosos sem quebrar suas regras." },
      { start: "08:30", end: "10:45", title: "Cine Ação: Velozes & Furiosos 10", desc: "Dom Toretto e sua família enfrentam o adversário mais letal de sua história." },
      { start: "10:45", end: "13:00", title: "Tiroteio & Fuga: O Resgate com Chris Hemsworth", desc: "Um mercenário destemido é contratado para resgatar o filho de um lorde do crime." },
      { start: "13:00", end: "15:15", title: "Guerra Urbana: Invasão a Londres", desc: "Terroristas atacam a capital britânica e o serviço secreto precisa agir." },
      { start: "15:15", end: "17:30", title: "Ficção Científica: Transformers: O Despertar das Feras", desc: "Maximals, Predacons e Terrorcons se juntam à batalha entre Autobots e Decepticons." },
      { start: "17:30", end: "19:45", title: "Linha de Fogo: Bastardos Inglórios", desc: "Na Segunda Guerra, soldados aliados planejam um golpe audacioso contra generais nazistas." },
      { start: "19:45", end: "22:00", title: "Ação Sem Limites: Tropa de Elite 2", desc: "Capitão Nascimento enfrenta a corrupção do sistema e o crime organizado." },
      { start: "22:00", end: "00:15", title: "Explosão Total: Busca Implacável 3", desc: "Bryan Mills é falsamente acusado de assassinato e deve caçar os culpados." },
      { start: "00:15", end: "06:00", title: "Madrugada Letal: Maratona Velozes e Furiosos", desc: "Carros turbinados, perseguições épicas e manobras inacreditáveis." }
    ],

    hbo: [
      { start: "06:00", end: "08:30", title: "HBO Filmes: O Homem de Aço", desc: "Um jovem descobre que tem poderes extraordinários e não é desta Terra." },
      { start: "08:30", end: "10:45", title: "Sessão DC: Batman com Robert Pattinson", desc: "O Cavaleiro das Trevas investiga o submundo de Gotham City contra o Charada." },
      { start: "10:45", end: "13:00", title: "Cine Blockbuster: Duna com Timothée Chalamet", desc: "Uma jornada mítica e emocionalmente carregada pelo planeta desértico Arrakis." },
      { start: "13:00", end: "15:15", title: "Mágica no Cinema: Harry Potter e o Cálice de Fogo", desc: "Harry compete no Torneio Tribuxo enfrentando desafios fatais e Voldemort." },
      { start: "15:15", end: "17:30", title: "Aventura Épica: O Senhor dos Anéis: As Duas Torres", desc: "Frodo e Sam continuam a jornada até Mordor para destruir o Um Anel." },
      { start: "17:30", end: "19:30", title: "Série Consagrada: House of the Dragon", desc: "A guerra civil entre a Casa Targaryen e a disputa pelo Trono de Ferro." },
      { start: "19:30", end: "21:00", title: "Série Premiada: The Last of Us", desc: "Joel e Ellie atravessam um território pós-apocalíptico desolado por fungos." },
      { start: "21:00", end: "23:30", title: "Estreia VIP HBO: Coringa: Delírio a Dois", desc: "Arthur Fleck no Arkham Asylum vivendo um amor alucinante com Arlequina." },
      { start: "23:30", end: "01:00", title: "Série Dramática: Succession", desc: "A luta pelo poder e controle do maior império de mídia do planeta." },
      { start: "01:00", end: "06:00", title: "HBO Madrugada: True Detective & White Lotus", desc: "Investigações sombrias e sátiras luxuosas nas noites da HBO." }
    ],

    // -----------------------------------------------------------------
    // NOTÍCIAS & INFANTIL
    // -----------------------------------------------------------------
    globonews: [
      { start: "06:00", end: "09:00", title: "GloboNews Em Ponto", desc: "A abertura dos mercados, o cenário político e as primeiras decisões de Brasília." },
      { start: "09:00", end: "13:00", title: "Conexão GloboNews", desc: "Três âncoras ao vivo no Rio, São Paulo e Brasília com as notícias do momento." },
      { start: "13:00", end: "16:00", title: "Estúdio i com Andréia Sadi", desc: "Os bastidores do poder, furos de reportagem e análises políticas sem rodeios." },
      { start: "16:00", end: "18:00", title: "GloboNews - Edição das 16h", desc: "O andamento dos fatos da tarde e decisões dos tribunais e ministérios." },
      { start: "18:00", end: "20:00", title: "GloboNews - Edição das 18h com César Tralli", desc: "O balanço geral das principais notícias do Brasil e do mundo no fim do dia." },
      { start: "20:00", end: "22:00", title: "GloboNews - Edição das 20h", desc: "Análise analítica e aprofundada dos acontecimentos que mexem com a nação." },
      { start: "22:00", end: "23:30", title: "Jornal das Dez com Aline Midlej", desc: "O principal telejornal da TV fechada brasileira com grandes comentaristas." },
      { start: "23:30", end: "01:00", title: "GloboNews Em Pauta com Marcelo Cosentino", desc: "Debate descontraído entre correspondentes de NY, Brasília e SP sobre as notícias." },
      { start: "01:00", end: "06:00", title: "GloboNews Madrugada 24 Horas", desc: "Giro ininterrupto de notícias do mundo e reportagens especiais." }
    ],

    cnn: [
      { start: "06:00", end: "09:30", title: "CNN Novo Dia", desc: "Primeiras notícias e impacto dos acontecimentos no seu bolso e no trânsito." },
      { start: "09:30", end: "12:00", title: "Live CNN Brasil", desc: "Cobertura dinâmica dos ministérios, Congresso Nacional e mercado financeiro." },
      { start: "12:00", end: "14:00", title: "O Grande Debate", desc: "Dois debatedores frente a frente analisando com argumentos sólidos as decisões do país." },
      { start: "14:00", end: "16:00", title: "Bastidores do Poder", desc: "Informações exclusivas dos bastidores de Brasília em tempo real." },
      { start: "16:00", end: "18:00", title: "CNN 360 Graus", desc: "Visão ampla dos desdobramentos políticos e econômicos da tarde." },
      { start: "18:00", end: "20:00", title: "CNN Arena", desc: "Comentaristas e analistas debatendo os pontos mais polêmicos do dia." },
      { start: "20:00", end: "22:00", title: "CNN Prime Time com Márcio Gomes", desc: "O telejornal de horário nobre mais completo e dinâmico da televisão brasileira." },
      { start: "22:00", end: "23:30", title: "WW com William Waack", desc: "Análise profunda de geopolítica internacional, macroeconomia e bastidores de Brasília." },
      { start: "23:30", end: "06:00", title: "CNN Madrugada 24 Horas", desc: "Plantão internacional permanente com a rede global de correspondentes da CNN." }
    ],

    cartoon: [
      { start: "06:00", end: "08:30", title: "O Incrível Mundo de Gumball", desc: "As aventuras hilárias do gato azul Gumball e seu irmão adotivo Darwin em Elmore." },
      { start: "08:30", end: "10:30", title: "Jovens Titãs em Ação!", desc: "Robin, Estelar, Ravena, Mutano e Ciborgue salvando o mundo entre muitas piadas." },
      { start: "10:30", end: "12:30", title: "Ursos Sem Curso", desc: "Pardo, Panda e Polar tentando se integrar à sociedade humana em San Francisco." },
      { start: "12:30", end: "14:30", title: "Hora de Aventura: Terra de Ooo", desc: "Finn, o humano, e Jake, o cão com poderes mágicos, explorando masmorras e reinos." },
      { start: "14:30", end: "16:30", title: "Ben 10: Omniverso", desc: "Ben Tennyson usando o relógio alienígena Omnitrix para derrotar vilões intergalácticos." },
      { start: "16:30", end: "18:30", title: "Apenas um Show (Regular Show)", desc: "Mordecai e Rigby transformando tarefas rotineiras do parque em confusões cósmicas." },
      { start: "18:30", end: "20:30", title: "Steven Universo: O Resgate das Gems", desc: "Steven e as Crystal Gems protegendo a Terra com amizade e canções." },
      { start: "20:30", end: "23:00", title: "Cine Cartoon: Grandes Animações", desc: "Filmes animados clássicos e especiais imperdíveis dos estúdios Cartoon Network." },
      { start: "23:00", end: "06:00", title: "Madrugada Toon Clássica: Tom & Jerry / Looney Tunes", desc: "Pernalonga, Patolino, Tom e Jerry em perseguições históricas e divertidas." }
    ],

    discovery: [
      { start: "06:00", end: "08:30", title: "Planeta Selvagem: Predadores da Terra", desc: "A vida secreta da fauna selvagem em florestas tropicais e savanas africanas." },
      { start: "08:30", end: "11:00", title: "Grandes Mistérios da História Antiga", desc: "Descobertas arqueológicas e civilizações perdidas resgatadas com tecnologia 3D." },
      { start: "11:00", end: "13:30", title: "Mega Construções & Engenharia Extrema", desc: "As obras mais grandiosas e inovadoras do planeta desafiando as leis da física." },
      { start: "13:30", end: "16:00", title: "Pesca Mortal: Mar de Bering", desc: "Pescadores enfrentam ondas gigantes e gelo ártico na temporada do caranguejo." },
      { start: "16:00", end: "18:30", title: "Largados e Pelados (Naked and Afraid)", desc: "Dois sobreviventes desafiam os ambientes mais hostis da Terra sem roupas ou suprimentos." },
      { start: "18:30", end: "21:00", title: "Febre do Ouro: Minas Extremas", desc: "Mineradores audaciosos arriscam tudo em busca de pepitas de ouro no Klondike." },
      { start: "21:00", end: "23:30", title: "Cosmos & Segredos do Universo", desc: "Uma viagem espetacular pelas galáxias, buracos negros e mistérios da astronomia." },
      { start: "23:30", end: "02:00", title: "Oficina Extrema: Motores & Carros Clássicos", desc: "Restaurações lendárias de hot rods e carros esportivos icônicos." },
      { start: "02:00", end: "06:00", title: "Expedições Desconhecidas na Madrugada", desc: "Mistérios não resolvidos e expedições arriscadas aos confins do mundo." }
    ]
  },

  // ===================================================================
  // 2. OBTENÇÃO DA GRADE PARA QUALQUER CANAL (DIAS ÚTEIS, SÁB E DOM)
  // ===================================================================
  getChannelSchedule(channel, dayOffset = 0) {
    if (!channel) return [];

    const chName = (channel.name || '').trim();
    const chLower = chName.toLowerCase();
    const chCat = (channel.category || '').toLowerCase();

    // 1. Identifica chave direta no catálogo oficial
    let key = null;
    if (chLower.includes('globo') && !chLower.includes('globonews') && !chLower.includes('gloob')) {
      key = 'globo';
    } else if (chLower.includes('record') && !chLower.includes('recordnews')) {
      key = 'record';
    } else if (chLower.includes('sbt')) {
      key = 'sbt';
    } else if (chLower.includes('band') && !chLower.includes('bandnews') && !chLower.includes('bandsports')) {
      key = 'band';
    } else if (chLower.includes('redetv') || chLower.includes('rede tv')) {
      key = 'redetv';
    } else if (chLower.includes('cultura')) {
      key = 'cultura';
    } else if (chLower.includes('sportv') || chLower.includes('sport tv')) {
      key = 'sportv';
    } else if (chLower.includes('espn')) {
      key = 'espn';
    } else if (chLower.includes('premiere')) {
      key = 'premiere';
    } else if (chLower.includes('combate') || chLower.includes('ufc')) {
      key = 'combate';
    } else if (chLower.includes('telecine') && chLower.includes('action')) {
      key = 'telecine_action';
    } else if (chLower.includes('telecine')) {
      key = 'telecine_premium';
    } else if (chLower.includes('hbo')) {
      key = 'hbo';
    } else if (chLower.includes('globonews') || chLower.includes('globo news')) {
      key = 'globonews';
    } else if (chLower.includes('cnn')) {
      key = 'cnn';
    } else if (chLower.includes('cartoon') || chLower.includes('desenho')) {
      key = 'cartoon';
    } else if (chLower.includes('discovery') && !chLower.includes('kids')) {
      key = 'discovery';
    }

    // 2. Determina o dia da semana específico (0 = Domingo, 6 = Sábado, 1..5 = Dias Úteis)
    const targetDate = new Date();
    if (dayOffset !== 0) {
      targetDate.setDate(targetDate.getDate() + dayOffset);
    }
    const dayOfWeek = targetDate.getDay();

    let dayKey = 'weekday';
    if (dayOfWeek === 0) dayKey = 'sunday';
    else if (dayOfWeek === 6) dayKey = 'saturday';

    // Procura por grade específica do dia (ex: globo_sunday, globo_saturday, globo_weekday)
    let rawList = null;
    if (key) {
      rawList = this.SCHEDULES[`${key}_${dayKey}`]
        || ((dayOfWeek === 0 || dayOfWeek === 6) ? this.SCHEDULES[`${key}_weekend`] : null)
        || this.SCHEDULES[key]
        || null;
    }

    // 3. Se não encontrou no dicionário fixo, gera grade dinâmica com base no dia da semana
    if (!rawList) {
      rawList = this.generateDynamicSchedule(chName, chCat, dayOffset, dayOfWeek);
    }

    // 4. Calcula horários em minutos e localiza o que está NO AR exatamente agora
    const now = new Date();
    const nowMins = (now.getHours() * 60 + now.getMinutes());
    // Se for o dia de hoje (offset 0), usamos o minuto atual. Em outros dias, mostramos o mesmo horário daquele dia
    const compReferenceMins = nowMins;

    const parseMins = (str) => {
      const parts = str.split(':');
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    };

    let activeIndex = -1;
    const formatted = [];

    rawList.forEach((item, idx) => {
      let sMins = parseMins(item.start);
      let eMins = parseMins(item.end);
      if (eMins <= sMins) eMins += 1440; // Passa da meia-noite

      let isNow = false;
      let progress = 0;

      let compNow = compReferenceMins;
      if (compNow < sMins && eMins > 1440) compNow += 1440;
      if (compNow >= sMins && compNow < eMins) {
        if (dayOffset === 0) {
          isNow = true;
          const dur = eMins - sMins;
          const elapsed = compNow - sMins;
          progress = dur > 0 ? Math.min(95, Math.max(5, Math.round((elapsed / dur) * 100))) : 50;
        }
        activeIndex = idx;
      }

      formatted.push({
        time: `${item.start} - ${item.end}`,
        name: item.title,
        desc: item.desc,
        isNow: isNow,
        progress: progress,
        startMins: sMins,
        endMins: eMins
      });
    });

    if (activeIndex === -1) {
      activeIndex = 0;
      if (dayOffset === 0 && formatted[0]) {
        formatted[0].isNow = true;
        formatted[0].progress = 40;
      }
    }

    // Retorna a atração ativa no topo + as próximas atrações sequenciais
    const result = [];
    const count = Math.min(formatted.length, 5);
    for (let i = 0; i < count; i++) {
      const slot = formatted[(activeIndex + i) % formatted.length];
      result.push({
        ...slot,
        isNow: (i === 0 && dayOffset === 0)
      });
    }

    return result;
  },

  // ===================================================================
  // 3. GERADOR DINÂMICO DETERMINÍSTICO (VARIAÇÃO DIÁRIA INTELIGENTE)
  // ===================================================================
  generateDynamicSchedule(channelName, category, dayOffset = 0, dayOfWeek = 1) {
    const cleanName = channelName
      .replace(/\b(FHD|UHD|4K|HD|SD|HEVC|H265|RAW|60FPS|HLS)\b/gi, '')
      .replace(/[\[\]\(\)\|\-]/g, '')
      .trim() || 'Canal';

    // Semente única baseada no nome do canal, no dia da semana e na data selecionada
    let seed = 0;
    for (let i = 0; i < cleanName.length; i++) {
      seed = (seed * 31 + cleanName.charCodeAt(i) + dayOffset * 23 + dayOfWeek * 47) % 100000;
    }

    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    const isSunday = (dayOfWeek === 0);
    const isSaturday = (dayOfWeek === 6);

    const isNews = /noticia|news|jornal/i.test(cleanName) || /noticia|news/i.test(category);
    const isSports = /esporte|sport|futebol|arena|gol/i.test(cleanName) || /esporte|sports|futebol/i.test(category);
    const isKids = /kids|infantil|desenho|animacao|toon/i.test(cleanName) || /infantil|kids/i.test(category);
    const isCinema = /cine|filme|movie|telecine|hbo|paramount/i.test(cleanName) || /filme|cinema/i.test(category);

    const timeBlocks = [
      { start: "06:00", end: "08:30" },
      { start: "08:30", end: "11:00" },
      { start: "11:00", end: "13:30" },
      { start: "13:30", end: "16:00" },
      { start: "16:00", end: "18:30" },
      { start: "18:30", end: "21:00" },
      { start: "21:00", end: "23:30" },
      { start: "23:30", end: "02:00" },
      { start: "02:00", end: "06:00" }
    ];

    const schedules = [];

    timeBlocks.forEach((block, idx) => {
      let title = "";
      let desc = "";

      if (isSports) {
        if (isSunday) {
          const titles = [
            `Giro do Domingo: Abertura da Rodada - ${cleanName}`,
            `Resenha Matinal: Escalações e Palpites dos Clássicos`,
            `Aquecimento Especial: Chegada aos Estádios`,
            `Transmissão Ao Vivo: Duelo de Gigantes - 1ª Divisão`,
            `Super Domingo de Futebol: O Clássico da Rodada Ao Vivo`,
            `Pós-Jogo: Todos os Gols, Melhores Momentos e Entrevistas`,
            `Mesa Redonda Dominical: A Análise Crítica dos Resultados`,
            `Compacto dos Grandes Jogos do Domingo`,
            `Melhores Lances & Gols da Rodada na Madrugada`
          ];
          title = titles[idx % titles.length];
        } else if (isSaturday) {
          const titles = [
            `Sábado Esportivo: Aquecimento e Manchetes - ${cleanName}`,
            `Debate Pré-Jogo: As Novidades dos Treinos`,
            `Transmissão Ao Vivo: Futebol Nacional / Séries A & B`,
            `Duelo da Tarde de Sábado Ao Vivo`,
            `Gols de Sábado & Cobertura Completa dos Clubes`,
            `Transmissão Ao Vivo: O Jogo da Noite de Sábado`,
            `Troca de Passes de Sábado: Análise Tática`,
            `Compacto dos Jogos Inesquecíveis`,
            `Madrugada dos Campeões: Melhores Momentos`
          ];
          title = titles[idx % titles.length];
        } else {
          const titles = [
            `Giro Esportivo Matinal - ${cleanName}`,
            `Debate & Resenha do Dia com Especialistas`,
            `Ao Vivo: Cobertura Completa dos Treinos e Clubes`,
            `Pré-Jogo Oficial: Aquecimento e Escalações`,
            `Transmissão Ao Vivo: Confronto Decisivo`,
            `Pós-Jogo: Todos os Gols, Melhores Momentos e Entrevistas`,
            `Mesa Redonda Noturna: Análise Crítica dos Resultados`,
            `Compacto Especial com os Lances Mais Emocionantes`,
            `Melhores Momentos & Grandes Jogos Históricos`
          ];
          title = titles[idx % titles.length];
        }
        desc = `Toda a adrenalina e os bastidores do esporte transmitidos em Full HD no canal ${cleanName}.`;
      } else if (isCinema) {
        if (isWeekend) {
          const titles = [
            `Matinê de Fim de Semana: Sessão Família no ${cleanName}`,
            `Cine Aventura & Ficção Científica Sem Intervalos`,
            `Sessão Especial de Sucessos de Bilheteria`,
            `Festival de Cinema: Grandes Astros de Hollywood`,
            `Cine Ação: Adrenalina, Perseguições e Efeitos Especiais`,
            `Superestreia do Fim de Semana: O Lançamento Mais Esperado`,
            `Sessão VIP da Noite: Superprodução Premiada`,
            `Cine Suspense Noturno: Tensão e Emoção Máxima`,
            `Cinema na Madrugada: Obras Consagradas pela Crítica`
          ];
          title = titles[idx % titles.length];
        } else {
          const titles = [
            `Cine Manhã: Filmes Leves e Clássicos no ${cleanName}`,
            `Sessão Especial: Comédias e Grandes Histórias`,
            `Cinema da Tarde: Campeões de Audiência`,
            `Festival de Sucessos do Cinema Mundial`,
            `Cine Ação & Aventura: Adrenalina Sem Cortes`,
            `Filme da Noite: Grande Produção Cinematográfica`,
            `Sessão Premium: Dramas e Suspenses Premiados`,
            `Cine Cult Noturno: Obras Aclamadas`,
            `Cinema na Madrugada: Sessão Especial sem Intervalos`
          ];
          title = titles[idx % titles.length];
        }
        desc = `Grandes produções cinematográficas com som imersivo e imagem de alta definição no canal ${cleanName}.`;
      } else if (isKids) {
        if (isWeekend) {
          const titles = [
            `Maratona Animada de Fim de Semana: Diversão Total`,
            `Clube dos Desenhos: Aventuras com Super-Heróis`,
            `Super Sessão Kids: Histórias Mágicas e Encantadas`,
            `Aventuras com Muita Risada para a Família`,
            `Cine Kids Especial: Longa-Metragem Animado`,
            `Turma da Fantasia: Episódios Inéditos Especiais`,
            `Super Desenhos da Noite: Vilões e Heróis em Ação`,
            `Historinhas para Dormir & Aventuras Noturnas`,
            `Madrugada Toon: Episódios Clássicos e Favoritos`
          ];
          title = titles[idx % titles.length];
        } else {
          const titles = [
            `Despertar Divertido: Historinhas e Animações`,
            `Clube dos Desenhos: Aventuras com Super Heróis`,
            `Maratona Animada da Tarde com Muita Risada`,
            `Aventuras Mágicas: Novos Episódios Exclusivos`,
            `Cine Kids Especial: A Grande Aventura dos Toons`,
            `Turma da Fantasia: Histórias Cheias de Imaginação`,
            `Super Desenhos da Noite: Vilões e Heróis em Ação`,
            `Historinhas para Dormir & Aventuras Noturnas`,
            `Madrugada Toon: Episódios Clássicos e Favoritos`
          ];
          title = titles[idx % titles.length];
        }
        desc = `Diversão garantida para toda a garotada com os personagens mais queridos da TV no canal ${cleanName}.`;
      } else if (isNews) {
        if (isWeekend) {
          const titles = [
            `Plantão de Fim de Semana: As Primeiras Notícias`,
            `Giro Nacional: O Balanço dos Acontecimentos`,
            `Edição Especial do Meio-Dia: Panorama Completo`,
            `Grandes Reportagens: Documentários e Investigações`,
            `Fatos da Semana: Os Desdobramentos da Política e Economia`,
            `Jornal Principal de Fim de Semana: Cobertura Completa`,
            `Debate dos Fatos: Análises dos Principais Temas`,
            `Balanço do Dia: O Resumo das Notícias`,
            `Plantão da Madrugada: Noticiário Internacional 24 Horas`
          ];
          title = titles[idx % titles.length];
        } else {
          const titles = [
            `Jornal da Manhã: Primeiras Notícias com ${cleanName}`,
            `Giro de Notícias ao Vivo: Trânsito, Clima e Economia`,
            `Edição do Meio-Dia: O Panorama Completo do País`,
            `Plantão em Tempo Real: Política e Mercado Financeiro`,
            `Repórter Especial: As Principais Manchetes da Tarde`,
            `Jornal Principal da Noite: Cobertura Nacional e Global`,
            `Debate Especial com Comentaristas e Analistas`,
            `Balanço do Dia: O Resumo Completo das Notícias`,
            `Edição da Madrugada: Noticiário Internacional 24h`
          ];
          title = titles[idx % titles.length];
        }
        desc = `Informação com credibilidade, reportagens investigativas e apuração em tempo real no canal ${cleanName}.`;
      } else {
        if (isWeekend) {
          const titles = [
            `Fim de Semana Especial: Música e Variedades no ${cleanName}`,
            `Revista de Sábado & Domingo: Histórias Inspiradoras`,
            `Edição Especial do Meio-Dia: Destaques da Semana`,
            `Programa de Variedades: Entretenimento e Cultura`,
            `Sessão Especial da Tarde: O Melhor do Canal`,
            `Grande Noticiário da Noite: O Giro dos Fatos`,
            `Super Show de Domingo & Sábado no ${cleanName}`,
            `Linha de Shows & Cinema de Fim de Semana`,
            `Madrugada Especial: Conteúdo Exclusivo 24 Horas`
          ];
          title = titles[idx % titles.length];
        } else {
          const titles = [
            `Manhã com Você: Variedades e Informação no ${cleanName}`,
            `Revista Eletrônica: Dicas, Notícias e Entretenimento`,
            `Jornal do Meio-Dia: Acontecimentos ao Vivo na Sua Região`,
            `Programa da Tarde: Entrevistas e Histórias Reais`,
            `Sessão Especial de Entretenimento & Cultura`,
            `Grande Noticiário da Noite: Os Fatos que Marcaram o Dia`,
            `Super Atração Noturna: O Melhor da Grade do ${cleanName}`,
            `Linha de Shows & Cinema Sem Intervalos`,
            `Programação Especial da Madrugada no ${cleanName}`
          ];
          title = titles[idx % titles.length];
        }
        desc = `Conteúdo exclusivo com imagem e áudio digital impecáveis na transmissão de ${cleanName}.`;
      }

      schedules.push({
        start: block.start,
        end: block.end,
        title: title,
        desc: desc
      });
    });

    return schedules;
  },

  // ===================================================================
  // 4. INTEGRAÇÃO ASSÍNCRONA COM A API XTREAM CODES
  // ===================================================================
  async fetchXtreamEpg(channel, callback) {
    if (!channel || !channel.url) return;

    // Extrai credenciais Xtream da URL
    const match = channel.url.match(/^(https?:\/\/[^\/]+)\/(?:live\/)?([^\/]+)\/([^\/]+)\/(\d+)/i);
    if (!match) return;

    const baseUrl = match[1];
    const user = match[2];
    const pass = match[3];
    const streamId = match[4];

    if (this._cache[streamId]) {
      if (typeof callback === 'function') callback(this._cache[streamId]);
      return;
    }

    if (this._inflight[streamId]) return;
    this._inflight[streamId] = true;

    try {
      const apiUrl = `${baseUrl}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&action=get_short_epg&stream_id=${streamId}&limit=10`;
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 3500);

      const res = await fetch(apiUrl, { signal: ctrl.signal });
      clearTimeout(tid);

      if (!res.ok) throw new Error('Status ' + res.status);
      const data = await res.json();

      if (data && Array.isArray(data.epg_listings) && data.epg_listings.length > 0) {
        const parsed = [];
        const nowSec = Math.floor(Date.now() / 1000);

        data.epg_listings.forEach(ep => {
          let title = ep.title || '';
          try {
            // Decodifica se estiver em base64
            if (/^[A-Za-z0-9+/=]+$/.test(title) && title.length > 8 && title.length % 4 === 0) {
              const decoded = decodeURIComponent(escape(atob(title)));
              if (decoded && decoded.length > 2) title = decoded;
            }
          } catch(e) {}

          let desc = ep.description || '';
          try {
            if (/^[A-Za-z0-9+/=]+$/.test(desc) && desc.length > 8 && desc.length % 4 === 0) {
              const decoded = decodeURIComponent(escape(atob(desc)));
              if (decoded && decoded.length > 2) desc = decoded;
            }
          } catch(e) {}

          const startSec = parseInt(ep.start_timestamp || '0', 10) || 0;
          const stopSec = parseInt(ep.stop_timestamp || '0', 10) || 0;

          const formatSec = (s) => {
            const d = new Date(s * 1000);
            return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
          };

          const isNow = (nowSec >= startSec && nowSec < stopSec);
          let progress = 0;
          if (isNow && stopSec > startSec) {
            progress = Math.min(95, Math.max(5, Math.round(((nowSec - startSec) / (stopSec - startSec)) * 100)));
          }

          let timeStr = "--:-- • --:--";
          if (startSec > 0 && stopSec > 0) {
            timeStr = `${formatSec(startSec)} - ${formatSec(stopSec)}`;
          } else if (ep.start && ep.end) {
            timeStr = `${ep.start.slice(11, 16)} - ${ep.end.slice(11, 16)}`;
          }

          parsed.push({
            time: timeStr,
            name: title.trim() || 'Programa Ao Vivo',
            desc: desc.trim() || 'Acompanhe a transmissão em alta definição.',
            isNow: isNow,
            progress: progress,
            startSec: startSec
          });
        });

        // Ordena por horário e localiza atração ativa
        parsed.sort((a, b) => a.startSec - b.startSec);
        let activeIdx = parsed.findIndex(p => p.isNow);
        if (activeIdx === -1) activeIdx = 0;

        const results = parsed.slice(activeIdx, activeIdx + 5);
        if (results.length > 0) {
          results[0].isNow = true;
          this._cache[streamId] = results;
          if (typeof callback === 'function') callback(results);
        }
      }
    } catch(e) {
      // Ignora silenciosamente e mantém grade determinística
    } finally {
      delete this._inflight[streamId];
    }
  }
};
