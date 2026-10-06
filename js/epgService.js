/**
 * Vion Player - Serviço de EPG Realista e Dinâmico
 * Suporte a:
 * 1. Grades diárias oficiais de 24h para os principais canais brasileiros
 * 2. Gerador inteligente determinístico para canais regionais e especializados
 * 3. Integração assíncrona com API Xtream Codes (get_short_epg)
 */

const EpgService = {
  _cache: {},
  _inflight: {},

  // ===================================================================
  // 1. DICIONÁRIO DE PROGRAMAÇÃO REAL DE 24 HORAS POR CANAL
  // ===================================================================
  SCHEDULES: {
    globo: [
      { start: "04:00", end: "06:00", title: "Hora Um da Notícia", desc: "Os principais fatos do início da manhã no Brasil e no mundo com Roberto Kovalick." },
      { start: "06:00", end: "08:30", title: "Bom Dia Praça & Bom Dia Brasil", desc: "Informações ao vivo do trânsito, previsão do tempo e primeiras notícias do dia." },
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
      { start: "20:30", end: "21:20", title: "Jornal Nacional", desc: "As principais notícias do dia no principal telejornal do Brasil com William Bonner." },
      { start: "21:20", end: "22:25", title: "Novela das Nove: Capítulo Inédito", desc: "Grandes revelações e conflitos na principal novela da TV brasileira." },
      { start: "22:25", end: "23:45", title: "Futebol / Linha de Shows / Cinema Especial", desc: "Transmissões ao vivo, séries exclusivas e superproduções da TV Globo." },
      { start: "23:45", end: "00:45", title: "Jornal da Globo", desc: "Análises aprofundadas da política, economia e do cenário internacional com Renata Lo Prete." },
      { start: "00:45", end: "01:30", title: "Conversa com Bial", desc: "Entrevistas inteligentes e aprofundadas sobre atualidades e cultura." },
      { start: "01:30", end: "03:00", title: "Comédia na Madrugada", desc: "Episódios divertidos das melhores séries de humor da televisão." },
      { start: "03:00", end: "04:00", title: "Corujão: Sessão Especial", desc: "Cinema na madrugada com títulos premiados de ação, drama e suspense." }
    ],

    record: [
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

    sbt: [
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

    band: [
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

    sportv: [
      { start: "06:00", end: "09:00", title: "Giro da Rodada & Compactos", desc: "Compactos dos principais jogos da noite e os melhores lances das partidas." },
      { start: "09:00", end: "12:00", title: "Redação SporTV com Marcelo Barreto", desc: "Leitura dos jornais, debates e bastidores do esporte nacional e internacional." },
      { start: "12:00", end: "13:00", title: "Seleção SporTV - Aquecimento", desc: "A prévia das discussões mais quentes com os melhores comentaristas esportivos." },
      { start: "13:00", end: "16:00", title: "Seleção SporTV com André Rizek", desc: "Análises táticas aprofundadas, tática e opiniões sobre o futebol brasileiro." },
      { start: "16:00", end: "19:00", title: "SporTV Tá na Área", desc: "Informação leve e bem-humorada com repórteres ao vivo nos estádios e centros de treino." },
      { start: "19:00", end: "22:00", title: "Transmissão Ao Vivo: Brasileirão / Copa do Brasil", desc: "A bola rolando ao vivo em Full HD com narração e comentários exclusivos do SporTV." },
      { start: "22:00", end: "23:30", title: "Troca de Passes com Felipe Diniz", desc: "Entrevistas exclusivas dos técnicos, gols da rodada e prancheta tática." },
      { start: "23:30", end: "01:00", title: "Boleiragem com Roger Flores", desc: "Bate-papo descontraído com ex-jogadores contando histórias inéditas de vestiário." },
      { start: "01:00", end: "06:00", title: "Reprise dos Melhores Jogos da Rodada", desc: "Reveja os confrontos mais emocionantes e os gols decisivos na íntegra." }
    ],

    espn: [
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

    telecine_premium: [
      { start: "06:00", end: "08:15", title: "Sessão Despertar: Duna - Parte 2", desc: "Paul Atreides se une a Chani e aos Fremen em busca de vingança épica." },
      { start: "08:15", end: "10:30", title: "Cine Estreia: Oppenheimer", desc: "A fascinante história do físico J. Robert Oppenheimer e o Projeto Manhattan." },
      { start: "10:30", end: "12:45", title: "Aventura Épica: Top Gun: Maverick", desc: "Pete Mitchell lidera os melhores graduados da Top Gun numa missão suicida." },
      { start: "12:45", end: "15:00", title: "Super Sessão: Barbie", desc: "No fabuloso mundo da Barbielândia, Barbie e Ken exploram a vida real." },
      { start: "15:00", end: "17:15", title: "Campeões de Bilheteria: John Wick 4", desc: "John Wick descobre um caminho para derrotar a Alta Cúpula em duelos intensos." },
      { start: "17:15", end: "19:45", title: "Cinema 4K: Missão Impossível - Acerto de Contas", desc: "Ethan Hunt e sua equipe rastreiam uma perigosa inteligência artificial." },
      { start: "19:45", end: "22:00", title: "Superestreia: Gladiador 2 (Exclusivo)", desc: "A grandiosa sequência épica de Roma nas melhores telas de cinema." },
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

    globonews: [
      { start: "06:00", end: "09:00", title: "GloboNews Em Ponto", desc: "A abertura dos mercados, o cenário político e as primeiras decisões de Brasília." },
      { start: "09:00", end: "13:00", title: "Conexão GloboNews", desc: "Reportagens e análises ao vivo simultâneas de São Paulo, Rio e Brasília." },
      { start: "13:00", end: "16:00", title: "Estúdio i com Andréia Sadi", desc: "Os bastidores quentes da política, apurações exclusivas e debates em tempo real." },
      { start: "16:00", end: "18:00", title: "GloboNews em Ponto da Tarde", desc: "A temperatura do Congresso Nacional e as repercussões econômicas do dia." },
      { start: "18:00", end: "20:00", title: "Edição das 18h com César Tralli", desc: "As notícias mais relevantes com repórteres em todos os estados do país." },
      { start: "20:00", end: "22:00", title: "GloboNews Em Pauta", desc: "Correspondentes de NY, Londres, SP e Brasília debatem os fatos marcantes." },
      { start: "22:00", end: "23:30", title: "Jornal das Dez com Aline Midlej", desc: "O principal resumo noturno com análises de especialistas consagrados." },
      { start: "23:30", end: "06:00", title: "Edição da Madrugada & Documentários", desc: "Plantão contínuo e especiais investigativos ao longo de toda a noite." }
    ],

    cnn: [
      { start: "06:00", end: "09:30", title: "CNN Novo Dia", desc: "O despertar com as manchetes urgentes, mercado financeiro e cenário internacional." },
      { start: "09:30", end: "12:00", title: "Live CNN", desc: "Cobertura dinâmica dos principais acontecimentos políticos do país ao vivo." },
      { start: "12:00", end: "14:00", title: "Visão CNN", desc: "Análises técnicas das medidas econômicas e repercussão jurídica das decisões." },
      { start: "14:00", end: "16:00", title: "CNN 360°", desc: "Entrevistas exclusivas com autoridades e o panorama completo dos três poderes." },
      { start: "16:00", end: "18:00", title: "CNN Arena", desc: "Debates plurais e acalorados sobre as pautas que dividem a opinião pública." },
      { start: "18:00", end: "20:00", title: "CNN Prime Time com Márcio Gomes", desc: "O resumo aprofundado dos fatos mais decisivos do dia com reportagens especiais." },
      { start: "20:00", end: "22:00", title: "WW com William Waack", desc: "Uma visão cirúrgica sobre geopolítica global e os impactos no Brasil." },
      { start: "22:00", end: "23:30", title: "Agora CNN", desc: "Os desdobramentos da noite e a preparação para o dia seguinte." },
      { start: "23:30", end: "06:00", title: "CNN Notícias Madrugada", desc: "Giro internacional com a rede global de correspondentes da CNN." }
    ],

    cartoon: [
      { start: "06:00", end: "08:00", title: "Ursos Sem Curso", desc: "Pardo, Panda e Polar tentam se enturmar no mundo dos humanos de forma hilária." },
      { start: "08:00", end: "10:00", title: "O Incrível Mundo de Gumball", desc: "A rotina maluca de Gumball e Darwin na cidade de Elmore com muita confusão." },
      { start: "10:00", end: "12:30", title: "Jovens Titãs em Ação!", desc: "Robin, Estelar, Ciborgue, Ravena e Mutano salvam o mundo entre muitas piadas." },
      { start: "12:30", end: "14:30", title: "Hora de Aventura com Finn e Jake", desc: "Jornadas fantásticas pela Terra de Ooo com monstros e magia." },
      { start: "14:30", end: "16:30", title: "Clarêncio, o Otimista", desc: "Um menino alegre e curioso que vê o lado bom em todas as coisas da vida." },
      { start: "16:30", end: "19:00", title: "Steven Universo & Ben 10", desc: "Batalhas com alienígenas e gemas mágicas para proteger a Terra." },
      { start: "19:00", end: "21:30", title: "Cine Cartoon: Longa-Metragem Animado", desc: "Filme animado especial cheio de ação e aventura para toda a família." },
      { start: "21:30", end: "23:30", title: "Apenas um Show com Mordecai e Rigby", desc: "Dois amigos zeladores de parque que transformam qualquer tarefa em caos cósmico." },
      { start: "23:30", end: "06:00", title: "Toonami & Desenhos Clássicos da Madrugada", desc: "As melhores animações nostálgicas que marcaram época." }
    ],

    discovery: [
      { start: "06:00", end: "08:00", title: "Carros Usados: Garimpo Sobre Rodas", desc: "Mecânicos e negociadores restauram clássicos abandonados para revenda com lucro." },
      { start: "08:00", end: "10:00", title: "Engenharia Fantástica", desc: "Como foram construídas as maiores pontes, túneis e arranha-céus da Terra." },
      { start: "10:00", end: "12:30", title: "Febre do Ouro: O Resgate do Klondike", desc: "Equipes de mineiros enfrentam o clima implacável em busca do minério precioso." },
      { start: "12:30", end: "15:00", title: "Largados e Pelados: Sobrevivência Extrema", desc: "Duplas de especialistas sobrevivem 21 dias nos habitats mais hostis do mundo." },
      { start: "15:00", end: "17:30", title: "Pesca Mortal: Mar de Bering em Chamas", desc: "Ondas de 10 metros e gelo congelante na caçada aos caranguejos-rei gigantes." },
      { start: "17:30", end: "19:30", title: "Quilos Mortais: A Luta pela Vida", desc: "Histórias inspiradoras de pacientes que buscam recuperar a saúde com o Dr. Now." },
      { start: "19:30", end: "21:30", title: "Caçadores de Mitos: Experimentos Lendários", desc: "Mitos populares da cultura e cinema colocados à prova com explosões e ciência." },
      { start: "21:30", end: "23:30", title: "Febre do Ouro: Batalha por Milhões", desc: "Rick Ness e Parker Schnabel apostam tudo nas escavações mais profundas." },
      { start: "23:30", end: "06:00", title: "Segredos da Natureza & Sobrevivência 24h", desc: "Explorações ininterruptas pelas florestas, savanas e oceanos do planeta." }
    ]
  },

  // ===================================================================
  // 2. OBTENÇÃO DA GRADE PARA QUALQUER CANAL
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

    let rawList = key && this.SCHEDULES[key] ? this.SCHEDULES[key] : null;

    // 2. Se não encontrou no dicionário fixo, gera grade personalizada dinâmica única por canal
    if (!rawList) {
      rawList = this.generateDynamicSchedule(chName, chCat, dayOffset);
    }

    // 3. Calcula horários em minutos e localiza o que está NO AR exatamente agora
    const now = new Date();
    if (dayOffset !== 0) {
      now.setDate(now.getDate() + dayOffset);
    }
    const nowMins = dayOffset === 0 ? (now.getHours() * 60 + now.getMinutes()) : (12 * 60);

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

      if (dayOffset === 0) {
        let compNow = nowMins;
        if (compNow < sMins && eMins > 1440) compNow += 1440;
        if (compNow >= sMins && compNow < eMins) {
          isNow = true;
          activeIndex = idx;
          const dur = eMins - sMins;
          const elapsed = compNow - sMins;
          progress = dur > 0 ? Math.min(95, Math.max(5, Math.round((elapsed / dur) * 100))) : 50;
        }
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
  // 3. GERADOR DINÂMICO DETERMINÍSTICO (CADA CANAL COM GRADE EXCLUSIVA)
  // ===================================================================
  generateDynamicSchedule(channelName, category, dayOffset = 0) {
    const cleanName = channelName
      .replace(/\b(FHD|UHD|4K|HD|SD|HEVC|H265|RAW|60FPS|HLS)\b/gi, '')
      .replace(/[\[\]\(\)\|\-]/g, '')
      .trim() || 'Canal';

    // Semente única baseada no nome do canal e na data selecionada
    let seed = 0;
    for (let i = 0; i < cleanName.length; i++) {
      seed = (seed * 31 + cleanName.charCodeAt(i) + dayOffset * 17) % 100000;
    }

    const pseudoRandom = (offset = 0) => {
      const x = Math.sin(seed + offset) * 10000;
      return x - Math.floor(x);
    };

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
      const r = pseudoRandom(idx * 7);
      let title = "";
      let desc = "";

      if (isSports) {
        const titles = [
          `Giro Esportivo Matinal - ${cleanName}`,
          `Debate & Resenha da Rodada com Especialistas`,
          `Ao Vivo: Cobertura Completa dos Treinos e Clubes`,
          `Pré-Jogo Oficial: Aquecimento e Escalações`,
          `Transmissão Ao Vivo: Confronto Decisivo`,
          `Pós-Jogo: Todos os Gols, Melhores Momentos e Entrevistas`,
          `Mesa Redonda Noturna: Análise Crítica dos Resultados`,
          `Compacto Especial com os Lances Mais Emocionantes`,
          `Melhores Momentos & Grandes Jogos Históricos`
        ];
        title = titles[idx % titles.length];
        desc = `Toda a adrenalina e os bastidores do esporte transmitidos em Full HD no canal ${cleanName}.`;
      } else if (isCinema) {
        const titles = [
          `Matinê de Cinema: Sessão Família no ${cleanName}`,
          `Cine Aventura & Ficção Científica Sem Cortes`,
          `Sessão Tarde de Cinema: Campeões de Bilheteria`,
          `Festival de Comédias & Grandes Estrelas`,
          `Cine Ação: Adrenalina, Perseguições e Explosões`,
          `Superestreia da Noite: O Grande Lançamento do Ano`,
          `Sessão Especial VIP: Superprodução Premiada`,
          `Cine Suspense Noturno: Mistério e Tensão Máxima`,
          `Cinema na Madrugada: Obras Aclamadas pela Crítica`
        ];
        title = titles[idx % titles.length];
        desc = `Grandes produções cinematográficas com som imersivo e imagem de alta definição no canal ${cleanName}.`;
      } else if (isKids) {
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
        desc = `Diversão garantida para toda a garotada com os personagens mais queridos da TV no canal ${cleanName}.`;
      } else if (isNews) {
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
        desc = `Informação com credibilidade, reportagens investigativas e apuração em tempo real no canal ${cleanName}.`;
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
