import { Locale } from "@/lib/types";

type DictionaryTree = {
  [key: string]: string | DictionaryTree;
};

const messages: Record<Locale, DictionaryTree> = {
  en: {
    app: {
      name: "Atlas Trainer CRM",
      tagline: "Coaching operations, workout execution, and AI-assisted follow-up in one flow.",
      demoMode: "Demo data mode",
      liveMode: "Firebase live mode",
      upcomingSession: "Open next session",
      allUsers: "Shared access",
      locale: "Language",
      localeHelp:
        "Switch the entire CRM between English and Estonian. Help pop-ups and AI draft framing follow the same locale.",
    },
    nav: {
      dashboard: "Dashboard",
      leads: "Leads",
      clients: "Clients",
      calendar: "Calendar",
      plans: "Plans",
      communications: "Communication",
      finance: "Finance",
      settings: "Settings",
      activity: "Activity",
    },
    common: {
      search: "Search",
      save: "Save",
      sent: "Sent",
      draft: "Draft",
      generate: "Generate",
      completed: "Completed",
      pending: "Pending",
      active: "Active",
      edit: "Edit",
      done: "Done",
      none: "No items yet",
      all: "All",
      open: "Open",
      openClient: "Open client",
      openSession: "Open session",
      remaining: "remaining",
      revenue: "Revenue",
      outlookReady: "Outlook sync",
      firebaseConnected: "Firebase sync",
      firebaseConnectedDetail:
        "Authentication and Firestore persistence are active. Changes save directly to the shared workspace.",
      currency: "EUR",
    },
    auth: {
      title: "Sign in to your coaching workspace",
      subtitle:
        "Firebase authentication now protects the CRM. Sign in with your coach account or create the first account for this workspace.",
      email: "Email",
      password: "Password",
      signIn: "Sign in",
      signOut: "Sign out",
      createAccount: "Create account",
      connecting: "Firebase",
      loadingTitle: "Connecting workspace",
      loadingSubtitle: "Checking your Firebase session before loading the CRM.",
      syncingWorkspace: "Your account is ready. Syncing the latest CRM data from Firestore.",
      featureOne: "Shared CRM state now persists in Firestore instead of browser-only demo storage.",
      featureTwo: "All AI draft routes stay server-side and can use your configured OpenAI model.",
      featureThree: "Microsoft Graph can still be added later without changing the rest of the workflow.",
      allowedOnly: "Allowed accounts",
      fillAllFields: "Fill in both email and password.",
      passwordHint: "Password must be at least 6 characters.",
      restrictedAccess:
        "This CRM is restricted to approved accounts only. Use one of the allowed coach email addresses.",
    },
    help: {
      leadStatus:
        "Lead statuses keep the first-contact pipeline visible until the person is converted into an active client.",
      packageBalance:
        "Package balance is tracked from prepaid package purchases. Remaining sessions update when a session is completed.",
      plannedActual:
        "The workout execution view keeps the planned workout and the actual performed workout separate so the coach can compare and adjust.",
      aiDrafts:
        "AI always creates a draft. The coach reviews, edits, and approves before anything is saved or sent.",
      finance:
        "Finance totals combine sold packages, payment status, monthly received revenue, and the liability of unused prepaid sessions.",
      bodyAssessment:
        "Body assessment entries stay attached to the client profile so AI can reference trends instead of isolated measurements.",
      calendar:
        "Calendar sync status shows whether the CRM event is only local, queued, or already mirrored to Outlook.",
      integrations:
        "Integrations are scaffolded server-side so credentials stay off the client. Enable them later by filling the environment variables.",
      workoutPlan:
        "An active workout plan becomes the source for the next session’s prefilled exercise list, which the coach can tick off or modify live.",
      communication:
        "Outgoing drafts and historical replies are grouped into threads so the coach sees the full conversation context before sending a recap.",
    },
    dashboard: {
      title: "Coach command center",
      subtitle:
        "Today’s schedule, package exposure, AI draft queue, and client momentum at a glance.",
      sessionsToday: "Sessions today",
      activeClients: "Active clients",
      openLeads: "Open leads",
      receivedThisMonth: "Received this month",
      focusBoard: "Focus board",
      agenda: "Today’s agenda",
      aiQueue: "AI review queue",
      activity: "Latest activity",
      packageLiability: "Unused package liability",
      outstanding: "Outstanding invoices",
    },
    leads: {
      title: "Lead pipeline",
      subtitle: "Track first contacts, trial sessions, and conversion into long-term clients.",
      convert: "Convert to client",
      converted: "Converted",
      nextStep: "Next step",
      source: "Source",
      goal: "Goal",
    },
    clients: {
      title: "Client roster",
      subtitle:
        "Profiles combine goals, health flags, prepaid packages, body analysis, plans, and communication history.",
      nextSession: "Next session",
      activePlan: "Active plan",
      packageLabel: "Package balance",
      consent: "Consent",
    },
    clientProfile: {
      overview: "Profile overview",
      packages: "Packages and billing",
      assessments: "Body assessments",
      workouts: "Workout plans and sessions",
      communication: "Communication history",
      drafts: "Recent AI drafts",
      healthFlags: "Health flags",
      latestAssessment: "Latest assessment",
      openActiveSession: "Open active workout view",
      noSession: "No upcoming session scheduled yet.",
    },
    workout: {
      title: "Workout execution",
      subtitle:
        "Run the session from the prefilled plan, record actual work, and generate a polished recap draft after training.",
      objective: "Session objective",
      coachNotes: "Coach notes",
      athleteRecap: "Athlete-facing notes",
      planned: "Planned",
      actual: "Actual",
      setDone: "Done",
      addExercise: "Add exercise",
      completeSession: "Mark session complete",
      recapDraft: "Generate client recap",
      nextDraft: "Generate next-session guidance",
      emailLog: "Log edited draft to email timeline",
      skipped: "Skipped",
      added: "Added",
      modified: "Modified",
      live: "Live log",
      emptyDraft:
        "No draft yet. Generate a recap or next-session note after updating the session log.",
    },
    calendar: {
      title: "Calendar and reminders",
      subtitle: "Weekly schedule, reminder queue, and Outlook sync readiness.",
      reminderQueue: "Reminder queue",
      syncState: "Sync state",
    },
    plans: {
      title: "Adaptive planning",
      subtitle:
        "Keep an active workout block and nutrition approach for each client, then generate AI draft updates from fresh performance data.",
      workoutBlock: "Workout block",
      nutritionPlan: "Nutrition plan",
      generateWorkout: "Generate workout block draft",
      generateNutrition: "Generate nutrition draft",
    },
    communications: {
      title: "Email threads and follow-ups",
      subtitle:
        "Review sent recaps, inbound replies, and pending reminders before the next touchpoint.",
      reminders: "Reminders",
      threads: "Email threads",
    },
    finance: {
      title: "Finance overview",
      subtitle:
        "Track monthly revenue, unpaid amounts, prepaid liability, and package sales without leaving the CRM.",
      invoices: "Invoices",
      payments: "Payments",
      templates: "Package catalog",
      expiring: "Expiring packages",
    },
    settings: {
      title: "System readiness",
      subtitle:
        "Translation coverage, package templates, and future integration readiness for Firebase, OpenAI, and Microsoft Graph.",
      integrations: "Integration readiness",
      packageCatalog: "Default package catalog",
      translation: "Translation behavior",
      translationNote:
        "English is the default locale. Estonian mirrors navigation, help text, and draft framing so the coach can switch without losing context.",
    },
    activity: {
      title: "Activity log",
      subtitle:
        "A single feed for conversions, session changes, AI draft creation, reminders, and sent communication.",
    },
    status: {
      new: "New",
      contacted: "Contacted",
      "trial-booked": "Trial booked",
      converted: "Converted",
      pending: "Pending",
      signed: "Signed",
      declined: "Declined",
      planned: "Planned",
      "in-progress": "In progress",
      completed: "Completed",
      cancelled: "Cancelled",
      "no-show": "No-show",
      paid: "Paid",
      partial: "Partial",
      overdue: "Overdue",
      synced: "Synced",
      manual: "Manual",
      ready: "Ready",
      draft: "Draft",
      reviewed: "Reviewed",
      sent: "Sent",
      scheduled: "Scheduled",
      done: "Done",
      active: "Active",
      archived: "Archived",
      live: "Live",
    },
  },
  et: {
    app: {
      name: "Atlas Trainer CRM",
      tagline: "Treeneri töölaud treeningute, kliendihalduse ja AI mustanditega ühes voos.",
      demoMode: "Demoandmete režiim",
      liveMode: "Firebase live režiim",
      upcomingSession: "Ava järgmine trenn",
      allUsers: "Jagatud ligipääs",
      locale: "Keel",
      localeHelp:
        "Vaheta kogu CRM inglise ja eesti keele vahel. Sama keelt kasutavad ka abi-pop-up’id ja AI mustandi raamistik.",
    },
    nav: {
      dashboard: "Töölaud",
      leads: "Leadid",
      clients: "Kliendid",
      calendar: "Kalender",
      plans: "Kavad",
      communications: "Suhtlus",
      finance: "Finants",
      settings: "Seaded",
      activity: "Logi",
    },
    common: {
      search: "Otsi",
      save: "Salvesta",
      sent: "Saadetud",
      draft: "Mustand",
      generate: "Genereeri",
      completed: "Tehtud",
      pending: "Ootel",
      active: "Aktiivne",
      edit: "Muuda",
      done: "Valmis",
      none: "Kirjeid veel ei ole",
      all: "Kõik",
      open: "Ava",
      openClient: "Ava klient",
      openSession: "Ava treening",
      remaining: "järel",
      revenue: "Tulu",
      outlookReady: "Outlooki sünk",
      firebaseConnected: "Firebase sünk",
      firebaseConnectedDetail:
        "Autentimine ja Firestore'i salvestus on aktiivsed. Muudatused lähevad otse jagatud tööruumi.",
      currency: "EUR",
    },
    auth: {
      title: "Logi treeneri tööruumi sisse",
      subtitle:
        "Firebase autentimine kaitseb nüüd CRM-i. Logi sisse olemasoleva kontoga või loo sellele tööruumile esimene konto.",
      email: "E-post",
      password: "Parool",
      signIn: "Logi sisse",
      signOut: "Logi välja",
      createAccount: "Loo konto",
      connecting: "Firebase",
      loadingTitle: "Tööruumi ühendamine",
      loadingSubtitle: "Kontrollin Firebase sessiooni enne CRM-i laadimist.",
      syncingWorkspace: "Konto on valmis. Sünkroniseerin Firestore'ist viimased CRM andmed.",
      featureOne: "Jagatud CRM seis salvestub nüüd Firestore'i, mitte ainult brauseri demoandmetesse.",
      featureTwo: "Kõik AI mustandi route'id jäävad serverisse ja saavad kasutada sinu OpenAI mudelit.",
      featureThree: "Microsoft Graphi saab lisada hiljem ilma ülejäänud töövoogu ümber tegemata.",
      allowedOnly: "Lubatud kontod",
      fillAllFields: "Täida nii e-post kui parool.",
      passwordHint: "Parool peab olema vähemalt 6 tähemärki pikk.",
      restrictedAccess:
        "See CRM on piiratud ainult kinnitatud kasutajatele. Kasuta ühte lubatud treeneri e-posti aadressidest.",
    },
    help: {
      leadStatus:
        "Leadi staatused hoiavad esmase müügitoru nähtaval kuni huviline muudetakse aktiivseks kliendiks.",
      packageBalance:
        "Paketi jääk arvutatakse ettemakstud ostude põhjal. Allesjäänud treeningud vähenevad siis, kui sessioon märgitakse tehtuks.",
      plannedActual:
        "Treeningu läbiviimise vaade hoiab plaanitud ja tegeliku soorituse eraldi, et treener saaks vahe kohe kirja panna.",
      aiDrafts:
        "AI loob alati ainult mustandi. Treener vaatab üle, muudab ja kinnitab enne salvestamist või saatmist.",
      finance:
        "Finantsvaade ühendab müüdud paketid, maksete seisu, kuu laekumised ja kasutamata ettemakstud trennide kohustuse.",
      bodyAssessment:
        "Kehaanalüüsi kirjed jäävad kliendiprofiili külge, et AI saaks arvestada trendidega, mitte ainult ühe mõõtmisega.",
      calendar:
        "Kalendri sünkrooni staatus näitab, kas sündmus on ainult CRM-is, järjekorras või juba Outlooki peegeldatud.",
      integrations:
        "Integratsioonid on ette valmistatud serveripoolel, et võtmed ei jõuaks brauserisse. Hiljem piisab keskkonnamuutujate täitmisest.",
      workoutPlan:
        "Aktiivne treeningkava on järgmise sessiooni eeltäidetud allikas, mida treener saab trennis linnukestega täita või muuta.",
      communication:
        "Väljaminevad mustandid ja varasemad vastused on koondatud thread’idesse, et treener näeks kogu suhtlusajalugu enne kokkuvõtte saatmist.",
    },
    dashboard: {
      title: "Treeneri juhtpaneel",
      subtitle:
        "Tänane graafik, paketikohustus, AI mustandite järjekord ja klientide edenemine ühest vaatest.",
      sessionsToday: "Tänased treeningud",
      activeClients: "Aktiivsed kliendid",
      openLeads: "Aktiivsed leadid",
      receivedThisMonth: "Laekunud sel kuul",
      focusBoard: "Fookus",
      agenda: "Tänane ajakava",
      aiQueue: "AI ülevaatuse järjekord",
      activity: "Viimased tegevused",
      packageLiability: "Kasutamata pakettide kohustus",
      outstanding: "Tasumata arved",
    },
    leads: {
      title: "Leadi toru",
      subtitle: "Halda esmakontakte, proovitreeninguid ja konverteerimist pikaajaliseks kliendiks.",
      convert: "Muuda kliendiks",
      converted: "Kliendiks muudetud",
      nextStep: "Järgmine samm",
      source: "Allikas",
      goal: "Eesmärk",
    },
    clients: {
      title: "Kliendibaas",
      subtitle:
        "Profiilid ühendavad eesmärgid, tervisemärkused, paketid, kehaanalüüsi, kavad ja suhtlusajaloo.",
      nextSession: "Järgmine trenn",
      activePlan: "Aktiivne kava",
      packageLabel: "Paketi jääk",
      consent: "Nõusolek",
    },
    clientProfile: {
      overview: "Profiili ülevaade",
      packages: "Paketid ja arveldus",
      assessments: "Kehaanalüüsid",
      workouts: "Treeningkavad ja sessioonid",
      communication: "Suhtlusajalugu",
      drafts: "Hiljutised AI mustandid",
      healthFlags: "Tervisefookused",
      latestAssessment: "Viimane kehaanalüüs",
      openActiveSession: "Ava aktiivne treeningvaade",
      noSession: "Järgmine treening pole veel kalendrisse pandud.",
    },
    workout: {
      title: "Treeningu läbiviimine",
      subtitle:
        "Käivita sessioon eeltäidetud kavast, logi tegelik sooritus ja loo kohe pärast trenni viisakas kokkuvõtte mustand.",
      objective: "Sessiooni eesmärk",
      coachNotes: "Treeneri märkused",
      athleteRecap: "Kliendile nähtavad märkused",
      planned: "Plaan",
      actual: "Tegelikkus",
      setDone: "Tehtud",
      addExercise: "Lisa harjutus",
      completeSession: "Märgi sessioon tehtuks",
      recapDraft: "Genereeri kliendikokkuvõte",
      nextDraft: "Genereeri järgmise trenni soovitus",
      emailLog: "Lisa muudetud mustand e-posti ajalukku",
      skipped: "Jäi ära",
      added: "Lisatud",
      modified: "Muudetud",
      live: "Live logi",
      emptyDraft:
        "Mustand puudub. Genereeri kokkuvõte või järgmise trenni soovitus pärast sessiooni logi uuendamist.",
    },
    calendar: {
      title: "Kalender ja meeldetuletused",
      subtitle: "Nädalavaade, meeldetuletuste järjekord ja Outlooki sünkrooni valmisolek.",
      reminderQueue: "Meeldetuletused",
      syncState: "Sünkrooni staatus",
    },
    plans: {
      title: "Kohanduvad kavad",
      subtitle:
        "Hoia igale kliendile aktiivset treeninguplokki ja toitumissuunda ning loo värskete andmete põhjal AI mustandi uuendusi.",
      workoutBlock: "Treeninguplokk",
      nutritionPlan: "Toitumiskava",
      generateWorkout: "Genereeri treeninguploki mustand",
      generateNutrition: "Genereeri toitumise mustand",
    },
    communications: {
      title: "E-kirjad ja järeltegevused",
      subtitle:
        "Vaata saadetud kokkuvõtteid, sissetulevaid vastuseid ja ootel meeldetuletusi enne järgmist kontakti.",
      reminders: "Meeldetuletused",
      threads: "Kirjavahetused",
    },
    finance: {
      title: "Finantsülevaade",
      subtitle:
        "Jälgi kuu tulu, tasumata summasid, ettemakstud kohustust ja paketimüüki otse CRM-ist.",
      invoices: "Arved",
      payments: "Laekumised",
      templates: "Paketikataloog",
      expiring: "Aeguvad paketid",
    },
    settings: {
      title: "Süsteemi valmisolek",
      subtitle:
        "Tõlgete kaetus, paketimallid ja tulevane Firebase’i, OpenAI ning Microsoft Graphi integratsioonivalmidus.",
      integrations: "Integratsioonide valmisolek",
      packageCatalog: "Vaikimisi paketikataloog",
      translation: "Tõlgete käitumine",
      translationNote:
        "Inglise keel on vaikevalik. Eesti keeles muutuvad navigeerimine, abi-pop-up’id ja AI mustandite raamid samal ajal.",
    },
    activity: {
      title: "Tegevuslogi",
      subtitle:
        "Üks koondvoog konverteerimiste, sessioonimuudatuste, AI mustandite, meeldetuletuste ja saadetud kirjade jaoks.",
    },
    status: {
      new: "Uus",
      contacted: "Kontakteeritud",
      "trial-booked": "Proov broneeritud",
      converted: "Kliendiks muudetud",
      pending: "Ootel",
      signed: "Kinnitatud",
      declined: "Keeldutud",
      planned: "Planeeritud",
      "in-progress": "Käimas",
      completed: "Tehtud",
      cancelled: "Tühistatud",
      "no-show": "Ei ilmunud",
      paid: "Makstud",
      partial: "Osaline",
      overdue: "Ületähtaja",
      synced: "Sünkroonitud",
      manual: "Käsitsi",
      ready: "Valmis",
      draft: "Mustand",
      reviewed: "Üle vaadatud",
      sent: "Saadetud",
      scheduled: "Ajastatud",
      done: "Valmis",
      active: "Aktiivne",
      archived: "Arhiveeritud",
      live: "Reaalajas",
    },
  },
};

export function translate(locale: Locale, key: string): string {
  const parts = key.split(".");
  let cursor: string | DictionaryTree = messages[locale];

  for (const part of parts) {
    if (typeof cursor === "string" || !(part in cursor)) {
      return key;
    }

    cursor = cursor[part];
  }

  return typeof cursor === "string" ? cursor : key;
}

export function getMessages(locale: Locale) {
  return messages[locale];
}
