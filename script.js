const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.querySelector(".site-nav");
const yearTarget = document.querySelector("#year");
const interestForm = document.querySelector("#interest-form");
const feedback = document.querySelector("#form-feedback");
const followup = document.querySelector("#form-followup");
const demoFillButton = document.querySelector("#demo-fill-button");
const config = window.ONE_LEVEL_CONFIG || {};

if (yearTarget) {
  yearTarget.textContent = new Date().getFullYear();
}

if (navToggle && siteNav) {
  navToggle.addEventListener("click", () => {
    const isOpen = siteNav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  siteNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      siteNav.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

function getCheckedValues(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
}

function setCheckboxValues(name, values) {
  const wanted = new Set(values);

  document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
    input.checked = wanted.has(input.value);
  });
}

async function submitFormData(payload) {
  const endpoint = config.leadEndpoint || "";

  if (
    !endpoint ||
    endpoint.includes("ADD_YOUR") ||
    ((location.protocol === "file:" || location.hostname === "127.0.0.1" || location.hostname === "localhost") &&
      endpoint.startsWith("/.netlify/functions/"))
  ) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    return {
      ok: true,
      mode: "demo",
      assessmentUrl: config.assessmentFallbackUrl || "",
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Lead capture failed.");
  }

  return response.json().catch(() => ({ ok: true }));
}

if (demoFillButton && interestForm) {
  demoFillButton.addEventListener("click", () => {
    const lead = config.demoLead || {};

    interestForm.querySelector('input[name="firstName"]').value = lead.firstName || "";
    interestForm.querySelector('input[name="lastName"]').value = lead.lastName || "";
    interestForm.querySelector('input[name="phone"]').value = lead.phone || "";
    interestForm.querySelector('input[name="email"]').value = lead.email || "";
    interestForm.querySelector('input[name="streetAddress"]').value = lead.streetAddress || "";
    interestForm.querySelector('input[name="addressLine2"]').value = lead.addressLine2 || "";
    interestForm.querySelector('input[name="city"]').value = lead.city || "";
    interestForm.querySelector('input[name="state"]').value = lead.state || "";
    interestForm.querySelector('input[name="zip"]').value = lead.zip || "";
    interestForm.querySelector('input[name="country"]').value = lead.country || "United States";
    setCheckboxValues("programInterest", lead.programInterest || []);
    setCheckboxValues("tradeInterest", lead.tradeInterest || []);
  });
}

if (interestForm && feedback) {
  interestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    feedback.className = "form-feedback";
    feedback.textContent = "";
    if (followup) {
      followup.innerHTML = "";
    }

    const programInterest = getCheckedValues("programInterest");
    const tradeInterest = getCheckedValues("tradeInterest");

    if (!interestForm.reportValidity()) {
      feedback.classList.add("error");
      feedback.textContent = "Please complete all required fields before submitting.";
      return;
    }

    if (programInterest.length === 0) {
      feedback.classList.add("error");
      feedback.textContent = "Please choose at least one program interest.";
      return;
    }

    if (tradeInterest.length === 0) {
      feedback.classList.add("error");
      feedback.textContent = "Please choose at least one trade interest.";
      return;
    }

    const payload = Object.fromEntries(new FormData(interestForm).entries());
    payload.programInterest = programInterest;
    payload.tradeInterest = tradeInterest;
    payload.submittedAt = new Date().toISOString();
    payload.sourcePage = "Community Bridge Demo";

    const submitButton = interestForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "Submitting...";

    try {
      const result = await submitFormData(payload);
      feedback.classList.add("success");
      feedback.textContent =
        "Lead captured. The shared demo workflow can now log the entry and send the next-step email.";

      if (followup && result && result.assessmentUrl) {
        followup.innerHTML = `Assessment link ready: <a href="${result.assessmentUrl}" target="_blank" rel="noreferrer">Open discovery form</a>`;
      }

      interestForm.reset();
    } catch (error) {
      feedback.classList.add("error");
      feedback.textContent = "There was a problem sending the lead. Please try again.";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Submit Interest";
    }
  });
}
