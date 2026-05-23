export type LegalSection = {
  title: string;
  body: string[];
};

export type LegalPageContent = {
  slug: "terms" | "privacy";
  eyebrow: string;
  title: string;
  description: string;
  updatedAt: string;
  summary: string[];
  sections: LegalSection[];
};

const platformSummary =
  "Marysoll Booking je booking intent sloj u okviru Beauty Business Growth OS platforme Marysoll: premium salon operating system za salone koji na marysoll.com kreiraju salon, vode marketing, sajt, bazu klijenata, usluge, termine i zakazivanja. Booking servis koristi te podatke da klijentima pomogne da brzo pronađu slobodan termin po lokaciji, vremenu i usluzi, kroz conversational booking, AI asistenta, smart recommendations i availability orchestration.";

export const termsContent: LegalPageContent = {
  slug: "terms",
  eyebrow: "Marysoll Booking",
  title: "Uslovi korišćenja servisa",
  description:
    "Osnovni uslovi korišćenja za Marysoll Booking, inteligentnog asistenta za pronalaženje i zakazivanje termina u salonima lepote i velnesa.",
  updatedAt: "23. maj 2026.",
  summary: [
    platformSummary,
    "Korišćenjem Marysoll Booking servisa prihvatate ove uslove. Ako servis koristite u ime salona, potvrđujete da imate ovlašćenje da upravljate podacima, uslugama, cenama i terminima tog salona.",
  ],
  sections: [
    {
      title: "Uslovi korišćenja servisa",
      body: [
        "Ovi uslovi uređuju korišćenje Marysoll Booking servisa, AI asistenta i povezanih funkcija za pretragu, preporuke i zakazivanje termina. Servis je deo Marysoll ekosistema i povezuje korisnike sa salonima koji koriste Marysoll platformu.",
        "Marysoll može povremeno unapređivati servis, menjati funkcionalnosti, dodavati nove AI tokove ili prilagođavati način prikaza slobodnih termina. Ažurirana verzija uslova biće dostupna na ovoj stranici.",
      ],
    },
    {
      title: "Namena servisa",
      body: [
        "Servis je namenjen brzom pronalaženju relevantnih salona, usluga i slobodnih termina po lokaciji, vremenu, tipu usluge, dostupnosti i preferencijama korisnika.",
        "AI assistant može voditi razgovor sa korisnikom, tumačiti booking intent, predlagati salone i usluge, upoređivati raspoloživost i pomagati oko slanja zahteva za termin. Preporuke su informativne i zasnivaju se na dostupnim podacima salona, signalima pretrage i kontekstu razgovora.",
      ],
    },
    {
      title: "Zakazivanje termina",
      body: [
        "Kada korisnik zatraži termin, Marysoll Booking prosleđuje relevantne podatke salonu ili sistemu salona radi potvrde, obrade ili daljeg dogovora. Sam termin može biti potvrđen tek kada salon prihvati zahtev ili kada platforma prikaže potvrdu u skladu sa pravilima konkretnog salona.",
        "Korisnik je odgovoran da unese tačne kontakt podatke, uslugu, vreme, lokaciju i sve napomene koje su važne za dolazak. Salon može kontaktirati korisnika radi potvrde, izmene ili otkazivanja termina.",
      ],
    },
    {
      title: "Cene i uslovi",
      body: [
        "Cene, trajanje usluga, depoziti, popusti, paketi, pravila kašnjenja i pravila otkazivanja određuje svaki salon za sebe. Marysoll nastoji da prikaže ažurne podatke, ali konačna cena i uslovi mogu zavisiti od procene salona, dodatnih usluga, dužine tretmana ili individualnog dogovora.",
        "Ako postoji razlika između informacije prikazane u booking servisu i informacije koju potvrdi salon, primenjuje se informacija koju je salon direktno potvrdio korisniku.",
      ],
    },
    {
      title: "Korisnički sadržaj",
      body: [
        "Korisnik može unositi poruke, napomene, kontakt podatke, ocene, komentare, preferencije i druge informacije potrebne za zakazivanje ili personalizaciju iskustva. Korisnik potvrđuje da sadržaj koji unosi ne krši prava trećih lica i da je tačan u meri u kojoj je relevantan za termin.",
        "Marysoll i saloni mogu koristiti korisnički sadržaj za obradu zahteva, podršku, poboljšanje usluge, sigurnost platforme i prikaz relevantnih preporuka, u skladu sa Politikom privatnosti.",
      ],
    },
    {
      title: "Zloupotreba servisa",
      body: [
        "Nije dozvoljeno koristiti servis za lažne rezervacije, uznemiravanje salona ili korisnika, slanje nezakonitog sadržaja, pokušaj neovlašćenog pristupa, ometanje rada platforme, scraping podataka, manipulaciju AI asistentom ili zaobilaženje tehničkih i bezbednosnih mera.",
        "Marysoll može ograničiti, suspendovati ili ukloniti pristup korisniku ili salonu ako postoji osnovana sumnja na zloupotrebu, sigurnosni rizik ili kršenje ovih uslova.",
      ],
    },
    {
      title: "Ograničenje odgovornosti",
      body: [
        "Marysoll obezbeđuje tehnološki sloj za pretragu, conversational booking, preporuke i koordinaciju dostupnosti. Saloni su odgovorni za tačnost svojih profila, usluga, cena, adresa, rasporeda, dostupnosti i izvršenje same usluge.",
        "Marysoll ne odgovara za kvalitet tretmana, kašnjenja, nedolazak korisnika ili salona, promene cena, lokalne uslove poslovanja salona, niti za odluke korisnika donete na osnovu preporuka koje su informativne prirode.",
      ],
    },
    {
      title: "Poricanje garancija",
      body: [
        "Servis se pruža u meri u kojoj je dostupan. Marysoll ne garantuje da će AI assistant uvek razumeti svaki zahtev, da će svi termini biti dostupni u realnom vremenu, niti da će servis raditi bez prekida, grešaka ili kašnjenja.",
        "AI preporuke, rangiranje salona i predlozi termina predstavljaju pomoć pri odlučivanju, a ne garanciju ishoda, kvaliteta usluge ili dostupnosti.",
      ],
    },
    {
      title: "Obaveštenja e-poštom i telefonom",
      body: [
        "Korisnik može dobijati obaveštenja putem e-pošte, telefona, SMS-a ili drugih kanala koje je ostavio, uključujući potvrde termina, izmene, podsetnike, poruke salona, status zahteva i važne servisne informacije.",
        "Marketinška komunikacija šalje se samo kada postoji odgovarajući osnov ili pristanak, uz mogućnost odjave gde je to primenljivo.",
      ],
    },
    {
      title: "Google map, adrese",
      body: [
        "Marysoll može prikazivati adrese salona, udaljenost, mapu i podatke o lokaciji koristeći Google Maps ili slične servise trećih strana. Podaci o mapama služe za lakše snalaženje i planiranje dolaska.",
        "Tačnost adrese i lokacije zavisi od podataka koje unese salon i od dostupnosti eksternih mapa. Korisnik treba da proveri adresu i vreme dolaska pre termina, posebno ako salon ima više lokacija ili privremene izmene radnog vremena.",
      ],
    },
  ],
};

export const privacyContent: LegalPageContent = {
  slug: "privacy",
  eyebrow: "Marysoll Booking",
  title: "Politika privatnosti i politika kolačića",
  description:
    "Kako Marysoll Booking prikuplja, koristi, čuva i štiti podatke korisnika, salona i posetilaca platforme.",
  updatedAt: "23. maj 2026.",
  summary: [
    platformSummary,
    "Ova politika objašnjava kako obrađujemo podatke kada koristite booking servis, AI asistenta, conversational booking tokove, pametne preporuke, obaveštenja, lokacijske signale i povezane Marysoll tenant sajtove.",
  ],
  sections: [
    {
      title: "Politika privatnosti i politika kolačića",
      body: [
        "Marysoll poštuje privatnost korisnika i salona. Podatke obrađujemo da bismo omogućili pronalaženje termina, komunikaciju sa salonima, personalizovane preporuke, sigurnost platforme i unapređenje Beauty Business Growth OS iskustva.",
        "Ova politika se odnosi na Marysoll Booking, marysoll.com, tenant stranice salona i povezane funkcije koje koriste Marysoll platformu, osim ako je na određenoj stranici navedena posebna politika.",
      ],
    },
    {
      title: "Koje podatke prikupljamo?",
      body: [
        "Možemo prikupljati podatke koje nam direktno date: ime, prezime, e-poštu, broj telefona, poruke, napomene za termin, izabranu uslugu, željeno vreme, odabrani salon, ocene, komentare i informacije potrebne za nalog ili booking zahtev.",
        "Možemo prikupljati tehničke i kontekstualne podatke: IP adresu, približnu lokaciju ili izabrani grad, uređaj, pregledač, vreme korišćenja, interakcije sa AI asistentom, pretrage, klikove, kolačiće i podatke o dostupnosti koje saloni objavljuju u Marysoll sistemu.",
      ],
    },
    {
      title: "Zaštita vaših ličnih podataka",
      body: [
        "Koristimo tehničke, organizacione i pristupne mere zaštite kako bismo smanjili rizik od neovlašćenog pristupa, gubitka, izmene ili zloupotrebe podataka. Pristup podacima imaju samo osobe i sistemi kojima je to potrebno za pružanje usluge.",
        "Ipak, nijedan digitalni sistem nije apsolutno siguran. Korisnik treba da čuva svoje pristupne podatke, koristi tačne kontakt informacije i odmah prijavi sumnjivu aktivnost.",
      ],
    },
    {
      title: "Kako koristimo vaše lične podatke?",
      body: [
        "Podatke koristimo za pretragu i zakazivanje termina, prosleđivanje zahteva salonu, potvrde i podsetnike, prikaz najrelevantnijih usluga, smart recommendations, availability orchestration, korisničku podršku, sprečavanje zloupotrebe i poboljšanje rada AI asistenta.",
        "Podaci iz razgovora sa AI asistentom mogu se koristiti za razumevanje namere korisnika, nastavak booking toka, prikaz preporuka i poboljšanje kvaliteta odgovora, uz primenu mera zaštite i ograničenja pristupa.",
      ],
    },
    {
      title: "Prigovor direktnom marketingu",
      body: [
        "Korisnik može u svakom trenutku uložiti prigovor na direktni marketing ili se odjaviti sa promotivnih poruka putem dostupnog linka, podešavanja naloga ili kontakt kanala Marysoll platforme.",
        "Servisna obaveštenja, kao što su potvrde termina, sigurnosne poruke i važne informacije o zakazivanju, mogu se slati i kada korisnik nije pretplaćen na marketing, jer su potrebna za pružanje usluge.",
      ],
    },
    {
      title: "Deljenje ličnih podataka sa trećim licima",
      body: [
        "Podatke delimo sa salonima kada je to potrebno za obradu zahteva, potvrdu termina, kontakt sa korisnikom ili pružanje usluge. Salon kao tenant može obrađivati podatke u okviru svog poslovanja i svojih zakonskih obaveza.",
        "Podatke možemo deliti sa pouzdanim pružaocima usluga kao što su hosting, baze podataka, analitika, e-pošta, SMS/telefonija, mape, sigurnosni alati i AI infrastrukturni servisi, isključivo u meri potrebnoj za rad platforme.",
      ],
    },
    {
      title: "Vaša prava u vezi sa vašim ličnim podacima",
      body: [
        "U skladu sa primenljivim propisima, možete tražiti pristup podacima, ispravku, brisanje, ograničenje obrade, prenosivost podataka, povlačenje pristanka ili prigovor na određenu obradu.",
        "Zahtev možete poslati putem kontakt kanala objavljenih na marysoll.com ili kroz dostupne funkcije naloga. Pre odgovora možemo tražiti potvrdu identiteta radi zaštite korisnika.",
      ],
    },
    {
      title: "Druge veb lokacije povezane sa našom Platformom",
      body: [
        "Marysoll Booking može voditi ka marysoll.com, tenant sajtovima salona, eksternim profilima, mapama, društvenim mrežama ili drugim veb lokacijama. Kada napustite Marysoll okruženje, mogu važiti politike privatnosti tih trećih strana.",
        "Tenant saloni na marysoll.com mogu imati sopstvene poslovne uslove, ponude, kampanje i pravila obrade podataka. Preporučujemo da proverite informacije konkretnog salona kada unosite podatke ili zakazujete termin.",
      ],
    },
    {
      title: "Gde čuvamo vaše lične podatke",
      body: [
        "Podaci se mogu čuvati na serverima Marysoll platforme, kod pružalaca cloud infrastrukture i kod ovlašćenih procesora koji omogućavaju rad booking servisa, tenant sajtova, baza podataka, komunikacije i analitike.",
        "Ukoliko se podaci prenose van zemlje korisnika, Marysoll nastoji da koristi odgovarajuće pravne, tehničke i ugovorne mere zaštite.",
      ],
    },
    {
      title: "Zadržavanje podataka",
      body: [
        "Podatke zadržavamo onoliko dugo koliko je potrebno za pružanje usluge, evidenciju termina, korisničku podršku, bezbednost, rešavanje sporova, zakonske obaveze i legitimne poslovne potrebe platforme ili salona.",
        "Kada podaci više nisu potrebni, brišemo ih, anonimizujemo ili ograničavamo njihovu obradu u skladu sa tehničkim mogućnostima i primenljivim pravilima.",
      ],
    },
    {
      title: "Naša politika o kolačićima",
      body: [
        "Koristimo kolačiće i slične tehnologije za osnovno funkcionisanje sajta, pamćenje podešavanja, razumevanje korišćenja platforme, merenje performansi, poboljšanje preporuka i, gde je primenljivo, marketing.",
        "Korisnik može kontrolisati kolačiće kroz podešavanja pregledača ili dostupna podešavanja pristanka. Isključivanje pojedinih kolačića može uticati na rad prijave, pretrage, booking toka ili personalizovanih preporuka.",
      ],
    },
  ],
};
