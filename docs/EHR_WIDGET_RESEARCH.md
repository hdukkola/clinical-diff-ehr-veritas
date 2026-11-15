# EHR widget research

Initial public-source inventory, 2026-11-15. A widget here is a reusable unit of work or information. A vendor may present it as a card, chart tab, workspace, notification, or board. Record that distinction and preserve the original workflow context. Product edition, specialty, deployment, role, and local configuration affect availability. This inventory can grow by vendor and installation where public evidence exists.

## Vendor evidence

| Product | Documented surfaces and patterns | Primary source |
| --- | --- | --- |
| Epic | Chart Review and patient context; pre-visit summary; clinician documentation and queued orders; inpatient care plans; cardiology procedures, obstetrics, and oncology workflows; pharmacy workflow; infection surveillance; patient portal. | [Chart Review slides](https://vendorservices.epic.com/Resources/2026_OEC06), [Clinical AI](https://www.epic.com/epic/post/epic-ai-charting-rolls-out-alongside-an-expanding-set-of-built-in-ai-capabilities/), [Acute and inpatient](https://www.epic.com/software/acute-and-inpatient-care/), [Portal](https://open.epic.com/clinical/PatientFacing), [Specialties](https://www.epic.com/software/specialties/) |
| Oracle Health EHR | Inbox and chart access; summary, vitals, problems, medications and orders, results, notes, visits, histories, specimens; generated summary with verification. | [User guide](https://docs.oracle.com/en/industries/health/oracle-health-ehr/ehrfg/oracle-health-ehr-user-guide.pdf), [Chart screenshot](https://www.oracle.com/webfolder/community/oraclehealth/roadmaps/2898234565_Clinical%20Suite.pdf), [Summaries](https://docs.oracle.com/en/industries/health/oracle-health-ehr/ehrug/summaries.html) |
| MEDITECH Expanse | Nursing handoff; configurable widgets; surveillance and specialty status boards; demographics, allergies, medications and problems; messages, critical labs and admission/discharge/transfer notifications. Mobile and desktop have distinct feature sets. | [Nursing](https://ehr.meditech.com/ehr-solutions/expanse-for-nurses), [Surveillance](https://ehr.meditech.com/ehr-solutions/meditech-surveillance), [Mobile](https://ehr.meditech.com/newsletters/expanded-functionality-available-in-expanse-now), [Labor and delivery](https://ehr.meditech.com/ehr-solutions/labor-and-delivery) |
| athenaOne | Ambulatory encounter preparation, outstanding orders, documentation with prior findings and templates, and visit close. | [Service description](https://www.athenahealth.com/sites/default/files/media_docs/athenaOne-Service-Description.pdf), [EHR overview](https://www.athenahealth.com/solutions/athenaone/electronic-health-records) |
| eClinicalWorks | Patient history search and supplemental outside-record retrieval through PRISMA and healow Insights. | [Implementation case study](https://www.eclinicalworks.com/wp-content/uploads/2022/05/sal-advocate-aurora-health-customer-success-story-FINAL-PRINT.pdf) |
| NextGen | Specialty charting templates, patient dashboard, chart documents, graphs from templates, orders and growth charts. Verify Office and Enterprise separately. | [Office dashboard](https://www.community.nextgen.com/mtknowledge/articles/Knowledge/Navigate-the-EHR-Dashboard), [Enterprise training](https://coursedev.nextgen.com/eLearning/5_9_2%20ABS_CH_Handout.pdf), [Specialty templates](https://www.nextgen.com/solutions/electronic-health-records/small-practices-nextgen-enterprise) |
| Tebra | Configurable patient facesheet and chart sidebar with specialty-dependent visibility. | [Chart view settings](https://helpme.tebra.com/Platform/Practice_Settings/Clinical/Chart_View_Settings) |
| VA VistA CPRS | Patient context panel, clinical reminders, order tabs, pharmacy orders, cumulative vitals and remote chart data. | [GUI user guide](https://www.va.gov/vdl/documents/Clinical/Comp_Patient_Recrd_Sys_%28CPRS%29/cprsguium.pdf), [Clinician guide](https://www.va.gov/files/2024-08/CPRS%20Pocket%20Guide.pdf) |
| OpenMRS 3 | Patient chart microfrontends, including allergies, conditions, biometrics, vitals, orders and configurable observations by encounter. | [Chart source](https://github.com/openmrs/openmrs-esm-patient-chart), [Chart configuration](https://o3-docs.openmrs.org/en-US/docs/configure-o3/configure-the-patient-chart/) |
| OpenEMR | Configurable dashboard widgets including problems, allergies, medications, vitals, insurance, billing, care team, preferences and advance directives. | [Dashboard widget guide](https://github.com/openemr/openemr/blob/master/interface/modules/custom_modules/oe-module-dashboard-context/Dashboard_Context_Manager_User_Guide.md) |
| InterSystems TrakCare | Encounter and longitudinal record, problem-oriented documentation, targeted worklists, pathways and care plans, an ICU workspace, and a clinical timeline aligning vitals, administrations, specimen collection and nursing tasks. | [Overview](https://www.intersystems.com/it/trakcare-overview-fact-sheet/), [ICU](https://www.intersystems.com/uk/products/trakcare/departments-documentation-extensions/trakcare-icu/), [Clinical timeline](https://assets.intersystems.com/c0/2f/f1b9b40d3c4b014f4c5ae4ed3658/ontrak-flash-newsletter-8.pdf) |
| Bahmni | Configurable dashboard controls for diagnoses, observations and trend charts, patient profile, drug orders, lab results, visits, radiology, disposition, and inpatient summary. | [Patient Dashboard 2.0](https://bahmni.atlassian.net/wiki/spaces/BAH/pages/5442240665/Patient%2BDashboard%2B2.0), [Clinical services](https://www.bahmni.org/clinical-services/) |
| EMIS Web | Summary, consultations, medications, problems, investigations, care history, diary, documents and referrals. Linked medications and problems; report list and workflow manager. | [NHS training guide](https://www.nwllearning.nhs.uk/pluginfile.php/19146/course/section/1963/EMIS%20Web%20for%20Beginners%20User%20Guide%202025.pdf), [NHS diagnostic workflow](https://www.uhb.nhs.uk/gps/diagnostic-electronic-requesting/ice-training-materials/emis-web-user-guide/) |
| TPP SystmOne | Configurable Patient Home sections for visits, unconfirmed medication, tasks, requests, sensitivities, reminders, recalls, alerts, and pathology/radiology filing. | [SystmConnect guide, p. 21](https://tpp-uk.com/wp-content/uploads/2024/10/SystmConnect-guide.pdf#page=21) |
| PointClickCare | Long-term care resident chart and care-plan goals, medication orders and timed administration records with overdue status. | [Long-term care resources](https://pages.pointclickcare.com/ROP-Resources.html), [Medication management](https://pointclickcare.com/wp-content/uploads/2024/09/PointClickCare-Medication-Management-Solutions-Guide.pdf) |

## Widget types to track

This taxonomy includes discovery targets. A vendor claim requires its own source in the matrix; list unverified items as leads.

| Family | Subtypes |
| --- | --- |
| Patient context | Identity, encounter/location, demographics, care team, contacts, language and accessibility, safety flags, preferences, advance directives |
| Chart review | Summary, problem list, diagnoses, medical/surgical/family/social history, longitudinal timeline, encounters, documents and external records, chart search |
| Medications and allergies | Current/historical list, reconciliation, changes, evidence, prescriptions, administration history/MAR, pharmacy verification, allergies/reactions and intolerances |
| Observation and diagnostics | Vitals and trends, flowsheets, intake/output, growth curves, lab and specimen status, critical results, microbiology, imaging/report viewer, pathology and genomics |
| Notes and encounter | Pre-visit prep, rooming, templates, progress notes, draft notes, dictation, signing queue, discharge summary and instructions |
| Orders and care planning | Pending and historical orders, order sets, referrals, care plans, goals, pathways, preventive care, immunizations, patient education |
| Work and communication | Schedule, patient list, rounds, inbox, task queues, results acknowledgment, handoff, admission/discharge/transfer tracking, portal messages |
| Specialty | ED tracking, ICU trends, operating room and anesthesia, labor and delivery, oncology regimens, behavioral health assessments, rehabilitation, pediatrics, dental and home care |
| Safety and oversight | Reminders, alerts and surveillance, risk scores, safety flags, documentation lineage, audit, data quality, population registries |
| Operations and patient access | Registration, coverage, prior authorization, coding and billing, staffing, capacity, portals, forms and scheduling |
| Clinical Diff additions | Before/after medication diff, review progress, evidence coverage, suggestion triage, model status, evaluation metrics and session activity already exist in the cockpit |

## First build queue

1. **Source evidence** — Extend the existing Provenance & Evidence Health card with linked earlier/later excerpts. Prove the shared widget spec with existing synthetic comparison data and drill-down.
2. **Encounter timeline** — Place earlier and later synthetic notes and documented changes in order. Extend the chart review flow; distinguish unknown dates from known encounter dates.
3. **Medication reconciliation** — Extend Medication Diff Breakdown and reuse review decisions to surface unresolved discrepancies. Keep prescribing and chart writes outside the demo.
4. **Follow-up worklist** — Extend Review Progress or Triage Queue for unresolved items. Keep evidence one action away.
5. **Allergies and problems** — Add only with separately labeled synthetic fixtures. Missing information must appear unknown; explicit negatives require source evidence.
6. **Results and trends** — Use dated synthetic observations with units and originals. Consider specialty and operational widgets for distinct views after the comparison workflow is verified.

Keep patient context stable and make extra capabilities discoverable through drill-down or optional placement. Use a separate product decision for write workflows, alerts, clinical decision support and production integrations.

## Research handoff

For each product and edition record surface, user role, specialty, item name, normalized family, read/action behavior, empty and exception states if visible, source URL and section, date checked and evidence grade. Use **documented** for details shown in a product guide or source, **overview** for vendor claims without UI detail, and **unverified** for leads. Separate public defaults from site-specific examples. Never use private charts or patient screenshots.

Open coverage lanes include legacy hospital installs and public examples, US ambulatory long tail (Veradigm, Practice Fusion, Greenway, AdvancedMD), deeper EMIS and SystmOne coverage and additional international systems (Dedalus, System C, Indici), open-source systems, and specialty products spanning ED, ICU, surgery, maternity, oncology, pediatrics, behavioral health, dental, and post-acute. Include patient and administrative surfaces. Account for unobservable vendor configurations explicitly and deduplicate by the job the clinician or staff member performs.

[Widget build template](WIDGET_BUILD_TEMPLATE.md)
