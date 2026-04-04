const SPREADSHEET_NAME = "Online Leads";
const LEADS_SHEET_NAME = "Lead Intake";
const FORM_NAME = "One Level Discovery Assessment";
const DEMO_EMAIL_OVERRIDE = "student.jayla1985@gmail.com";
const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();

const LEAD_HEADERS = [
  "Lead ID",
  "Submitted At",
  "Source Page",
  "First Name",
  "Last Name",
  "Full Name",
  "Phone",
  "Email",
  "Street Address",
  "Address Line 2",
  "City",
  "State",
  "ZIP",
  "Country",
  "Program Interest",
  "Trade Interest",
  "Capture Verified",
  "Warm Email Sent At",
  "Warm Email Recipient",
  "Assessment Form URL",
  "Initial Alignment Signal",
  "Internal Status",
  "Notes",
];

function doGet() {
  const assets = ensureAssets_();
  return jsonResponse_({
    ok: true,
    spreadsheetUrl: assets.spreadsheet.getUrl(),
    formUrl: assets.form.getPublishedUrl(),
  });
}

function doPost(e) {
  const lead = normalizeLead_(JSON.parse((e.postData && e.postData.contents) || "{}"));
  const assets = ensureAssets_();
  const assessmentUrl = buildPrefilledAssessmentUrl_(assets.form, lead);
  const leadId = appendLead_(assets.spreadsheet, lead, assessmentUrl);
  const emailRecipient = sendWarmEmail_(lead, assessmentUrl, leadId);
  updateLeadEmailStatus_(assets.spreadsheet, leadId, emailRecipient);

  return jsonResponse_({
    ok: true,
    leadId,
    assessmentUrl,
    spreadsheetUrl: assets.spreadsheet.getUrl(),
    emailRecipient,
  });
}

function ensureAssets_() {
  const spreadsheet = ensureSpreadsheet_();
  const leadSheet = ensureSheet_(spreadsheet, LEADS_SHEET_NAME, LEAD_HEADERS);
  const form = ensureForm_(spreadsheet);

  leadSheet.autoResizeColumns(1, LEAD_HEADERS.length);
  ensureAssessmentTrigger_(form);

  return { spreadsheet, form };
}

function ensureSpreadsheet_() {
  const storedId = SCRIPT_PROPERTIES.getProperty("ONLINE_LEADS_SPREADSHEET_ID");

  if (storedId) {
    try {
      return SpreadsheetApp.openById(storedId);
    } catch (error) {}
  }

  const existing = DriveApp.getFilesByName(SPREADSHEET_NAME);

  if (existing.hasNext()) {
    const spreadsheet = SpreadsheetApp.open(existing.next());
    SCRIPT_PROPERTIES.setProperty("ONLINE_LEADS_SPREADSHEET_ID", spreadsheet.getId());
    return spreadsheet;
  }

  const spreadsheet = SpreadsheetApp.create(SPREADSHEET_NAME);
  SCRIPT_PROPERTIES.setProperty("ONLINE_LEADS_SPREADSHEET_ID", spreadsheet.getId());
  return spreadsheet;
}

function ensureSheet_(spreadsheet, sheetName, headers) {
  let sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName, 0);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function ensureForm_(spreadsheet) {
  const storedId = SCRIPT_PROPERTIES.getProperty("ONE_LEVEL_ASSESSMENT_FORM_ID");

  if (storedId) {
    try {
      return FormApp.openById(storedId);
    } catch (error) {}
  }

  const existing = DriveApp.getFilesByName(FORM_NAME);

  if (existing.hasNext()) {
    const form = FormApp.openById(existing.next().getId());
    form.setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheet.getId());
    SCRIPT_PROPERTIES.setProperty("ONE_LEVEL_ASSESSMENT_FORM_ID", form.getId());
    return form;
  }

  const form = FormApp.create(FORM_NAME);
  form.setDescription(
    "Thank you for your interest in One Level Energy NFP. This short assessment helps us understand your goals, your needs, and how we can best support you."
  );
  form.setConfirmationMessage(
    "Thank you for sharing more about your goals. The One Level team can use your responses to prepare a more thoughtful follow-up."
  );

  form.addTextItem().setTitle("Full Name").setRequired(true);
  form.addTextItem().setTitle("Email Address").setRequired(true);
  form.addTextItem().setTitle("Phone Number");
  form
    .addParagraphTextItem()
    .setTitle("What are you looking to achieve right now?")
    .setRequired(true);
  form
    .addParagraphTextItem()
    .setTitle("What kind of help, information, or support do you need most?")
    .setRequired(true);
  form
    .addParagraphTextItem()
    .setTitle("What have you tried in the past, if anything?")
    .setRequired(true);
  form
    .addMultipleChoiceItem()
    .setTitle("How much time are you willing to commit each week?")
    .setChoiceValues(["Less than 2 hours", "2 to 5 hours", "5 to 10 hours", "10 or more hours"])
    .setRequired(true);
  form
    .addParagraphTextItem()
    .setTitle("What keeps you up at night about this right now?")
    .setRequired(true);
  form
    .addParagraphTextItem()
    .setTitle("What is your biggest fear about starting this endeavor?")
    .setRequired(true);
  form
    .addParagraphTextItem()
    .setTitle("What would need to align for you to feel confident taking the next step?")
    .setRequired(true);
  form
    .addMultipleChoiceItem()
    .setTitle("Which pathway are you most interested in?")
    .setChoiceValues(["Pre-Apprenticeship Program", "Clean Energy / EnRich Pathway", "Still Exploring"])
    .setRequired(true);
  form
    .addCheckboxItem()
    .setTitle("Which trades or career areas are you most interested in?")
    .setChoiceValues([
      "Carpenter",
      "Electrician",
      "Sheet Metal Worker",
      "Plumber & Steamfitter",
      "Laborer",
      "Bricklayer",
      "Glazier",
      "Roofer",
      "Operator",
      "Clean Energy Careers",
      "Still Exploring",
    ])
    .setRequired(true);

  form.setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheet.getId());
  SCRIPT_PROPERTIES.setProperty("ONE_LEVEL_ASSESSMENT_FORM_ID", form.getId());
  return form;
}

function ensureAssessmentTrigger_(form) {
  const existing = ScriptApp.getProjectTriggers().some((trigger) => {
    return trigger.getHandlerFunction() === "handleAssessmentSubmit_";
  });

  if (!existing) {
    ScriptApp.newTrigger("handleAssessmentSubmit_").forForm(form).onFormSubmit().create();
  }
}

function appendLead_(spreadsheet, lead, assessmentUrl) {
  const leadSheet = ensureSheet_(spreadsheet, LEADS_SHEET_NAME, LEAD_HEADERS);
  const leadId = Utilities.getUuid();
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim();

  leadSheet.appendRow([
    leadId,
    new Date(),
    lead.sourcePage,
    lead.firstName,
    lead.lastName,
    fullName,
    lead.phone,
    lead.email,
    lead.streetAddress,
    lead.addressLine2,
    lead.city,
    lead.state,
    lead.zip,
    lead.country,
    lead.programInterest.join(", "),
    lead.tradeInterest.join(", "),
    "Yes",
    "",
    "",
    assessmentUrl,
    computeInitialAlignmentSignal_(lead),
    "New Lead",
    "",
  ]);

  return leadId;
}

function updateLeadEmailStatus_(spreadsheet, leadId, emailRecipient) {
  const sheet = spreadsheet.getSheetByName(LEADS_SHEET_NAME);
  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i += 1) {
    if (values[i][0] === leadId) {
      sheet.getRange(i + 1, 18).setValue(new Date());
      sheet.getRange(i + 1, 19).setValue(emailRecipient);
      sheet.getRange(i + 1, 22).setValue("Warm Email Sent");
      return;
    }
  }
}

function buildPrefilledAssessmentUrl_(form, lead) {
  const response = form.createResponse();
  const items = form.getItems();
  const itemByTitle = {};

  items.forEach((item) => {
    itemByTitle[item.getTitle()] = item;
  });

  addTextResponse_(
    response,
    itemByTitle["Full Name"],
    [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim()
  );
  addTextResponse_(response, itemByTitle["Email Address"], lead.email);
  addTextResponse_(response, itemByTitle["Phone Number"], lead.phone);
  addListResponse_(
    response,
    itemByTitle["Which pathway are you most interested in?"],
    lead.programInterest[0] || "Still Exploring"
  );
  addCheckboxResponse_(
    response,
    itemByTitle["Which trades or career areas are you most interested in?"],
    lead.tradeInterest
  );

  return response.toPrefilledUrl();
}

function addTextResponse_(response, item, value) {
  if (item && value) {
    response.withItemResponse(item.asTextItem().createResponse(String(value)));
  }
}

function addListResponse_(response, item, value) {
  if (item && value) {
    response.withItemResponse(item.asMultipleChoiceItem().createResponse(String(value)));
  }
}

function addCheckboxResponse_(response, item, values) {
  if (item && values && values.length) {
    response.withItemResponse(item.asCheckboxItem().createResponse(values));
  }
}

function sendWarmEmail_(lead, assessmentUrl, leadId) {
  const recipient = DEMO_EMAIL_OVERRIDE || lead.email;
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim();
  const subject = "One Level Demo Follow-Up for " + fullName;
  const htmlBody = [
    "<p>Hello " + lead.firstName + ",</p>",
    "<p>Thank you for your interest in One Level Energy NFP. We appreciate you taking the time to share your information with us.</p>",
    "<p>Here is what we captured for your inquiry:</p>",
    "<ul>",
    "<li><strong>Name:</strong> " + fullName + "</li>",
    "<li><strong>Phone:</strong> " + lead.phone + "</li>",
    "<li><strong>Email:</strong> " + lead.email + "</li>",
    "<li><strong>Program Interest:</strong> " + lead.programInterest.join(", ") + "</li>",
    "<li><strong>Trade Interest:</strong> " + lead.tradeInterest.join(", ") + "</li>",
    "<li><strong>Lead ID:</strong> " + leadId + "</li>",
    "</ul>",
    "<p>To help us better understand how we can serve you, please complete our short discovery assessment:</p>",
    "<p><a href=\"" + assessmentUrl + "\">Open the assessment form</a></p>",
    "<p>Thank you again for your time. We look forward to learning more about how we can support your goals.</p>",
    "<p>Warmly,<br>One Level Energy NFP</p>",
  ].join("");

  MailApp.sendEmail({
    to: recipient,
    subject,
    htmlBody,
  });

  return recipient;
}

function handleAssessmentSubmit_(e) {
  const response = e.response;
  const itemResponses = response.getItemResponses();
  const answerMap = {};

  itemResponses.forEach((itemResponse) => {
    answerMap[itemResponse.getItem().getTitle()] = itemResponse.getResponse();
  });

  const spreadsheet = ensureSpreadsheet_();
  let sheet = spreadsheet.getSheetByName("Assessment Review");

  if (!sheet) {
    sheet = spreadsheet.insertSheet("Assessment Review");
    sheet.appendRow([
      "Submitted At",
      "Full Name",
      "Email Address",
      "Goal Summary",
      "Primary Need",
      "Time Commitment",
      "Confidence Trigger",
      "Readiness Signal",
    ]);
    sheet.setFrozenRows(1);
  }

  sheet.appendRow([
    new Date(),
    answerMap["Full Name"] || "",
    answerMap["Email Address"] || "",
    answerMap["What are you looking to achieve right now?"] || "",
    answerMap["What kind of help, information, or support do you need most?"] || "",
    answerMap["How much time are you willing to commit each week?"] || "",
    answerMap["What would need to align for you to feel confident taking the next step?"] || "",
    computeAssessmentReadinessSignal_(answerMap),
  ]);
}

function computeInitialAlignmentSignal_(lead) {
  let score = 0;

  if (lead.programInterest.length > 1) {
    score += 2;
  }

  if (lead.tradeInterest.length >= 2) {
    score += 2;
  } else if (lead.tradeInterest.length === 1) {
    score += 1;
  }

  if (lead.programInterest.join(" ").match(/Clean Energy/i)) {
    score += 1;
  }

  if (score >= 4) {
    return "High Follow-Up Priority";
  }

  if (score >= 2) {
    return "Strong Interest";
  }

  return "Needs Conversation";
}

function computeAssessmentReadinessSignal_(answers) {
  let score = 0;
  const goal = String(answers["What are you looking to achieve right now?"] || "");
  const support = String(answers["What kind of help, information, or support do you need most?"] || "");
  const time = String(answers["How much time are you willing to commit each week?"] || "");
  const alignment = String(
    answers["What would need to align for you to feel confident taking the next step?"] || ""
  );

  if (goal.length > 35) {
    score += 1;
  }

  if (support.length > 35) {
    score += 1;
  }

  if (time === "5 to 10 hours" || time === "10 or more hours") {
    score += 1;
  }

  if (alignment.length > 35) {
    score += 1;
  }

  if (score >= 4) {
    return "High Readiness";
  }

  if (score >= 2) {
    return "Moderate Readiness";
  }

  return "Needs More Discovery";
}

function normalizeLead_(payload) {
  return {
    firstName: requiredText_(payload.firstName, "First name"),
    lastName: requiredText_(payload.lastName, "Last name"),
    phone: requiredText_(payload.phone, "Phone"),
    email: requiredText_(payload.email, "Email"),
    streetAddress: requiredText_(payload.streetAddress, "Street address"),
    addressLine2: String(payload.addressLine2 || "").trim(),
    city: requiredText_(payload.city, "City"),
    state: requiredText_(payload.state, "State"),
    zip: requiredText_(payload.zip, "ZIP"),
    country: requiredText_(payload.country, "Country"),
    programInterest: requiredArray_(payload.programInterest, "Program interest"),
    tradeInterest: requiredArray_(payload.tradeInterest, "Trade interest"),
    sourcePage: String(payload.sourcePage || "Website").trim(),
  };
}

function requiredText_(value, fieldName) {
  const cleanValue = String(value || "").trim();

  if (!cleanValue) {
    throw new Error(fieldName + " is required.");
  }

  return cleanValue;
}

function requiredArray_(value, fieldName) {
  const cleanValues = Array.isArray(value)
    ? value.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];

  if (!cleanValues.length) {
    throw new Error(fieldName + " is required.");
  }

  return cleanValues;
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}
