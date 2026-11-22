type PolicySection = {heading:string; paragraphs:readonly string[]; bullets:readonly string[]; afterBullets?:readonly string[]};
type LegalPolicy = {slug:string; title:string; sourceUrl?:string; effectiveDate?:string; effectiveDateLabel?:string; intro:readonly string[]; sections:readonly PolicySection[]};

// Privacy Policy and Terms of Use carry over the published maxtravel.in text
// and effective date. The other policies retain their maxtravel.us sources.
export const legalPolicies: readonly LegalPolicy[] = [
  {
    "slug": "privacy-policy",
    "title": "Privacy Policy",
    "effectiveDate": "2026-10-27",
    "effectiveDateLabel": "27 October 2026",
    "intro": [
      "Business: Max Travel, a proprietorship of Moez Meghani."
    ],
    "sections": [
      {
        "heading": "1. About this policy",
        "paragraphs": [
          "This policy explains how Max Travel handles personal information when you use maxtravel.in, create an account, make travel enquiries or bookings, or communicate with our team. Our office is in Secunderabad, India. For privacy questions and requests, email cs@maxtravel.in.",
          "The information involved depends on the services you use. Booking and payment sections apply when those services are available; a displayed search result or payment acknowledgement is not, by itself, a confirmed travel booking."
        ],
        "bullets": []
      },
      {
        "heading": "2. Information we collect",
        "paragraphs": [
          "Account information includes your name, email address, account credentials, verification status and security settings. We also process session and device information needed to provide account access and protect accounts.",
          "Travel information may include passenger and guest names, contact details, dates of birth or ages, gender, nationality, passport information where required, itinerary, travel dates, accommodation preferences and booking references. If you choose to save traveller profiles, we store those details for future use. For business bookings, we may also collect company and GST billing details.",
          "Transaction records include amounts, payment method, payment and refund references, status, invoices and cancellation records. Payment providers process the payment information submitted through their payment services under their own privacy notices. Please do not send card numbers, passwords, payment OTPs or full identity documents through ordinary email or WhatsApp.",
          "When you contact us, we receive your messages, contact details and information you choose to provide. WhatsApp records may include message content, delivery status and communication preferences. Technical records may include IP addresses, browser or device details, session identifiers, search activity and security or operational logs."
        ],
        "bullets": []
      },
      {
        "heading": "3. How we use information",
        "paragraphs": [
          "We use relevant information to:"
        ],
        "bullets": [
          "Create and manage accounts, verify email addresses and support account recovery.",
          "Search for travel options, prepare quotes, arrange bookings and provide travel documents.",
          "Process and reconcile payments, cancellations, amendments and refunds.",
          "Answer enquiries, send service updates and maintain customer-service records.",
          "Save traveller details when you choose that feature.",
          "Protect our services, investigate misuse and maintain transaction and accounting records.",
          "Send optional promotional communications where you have agreed to receive them."
        ],
        "afterBullets": [
          "We request information needed for the service you select. If you do not provide required details, we may be unable to complete that service. Optional marketing is not a condition of making a booking."
        ]
      },
      {
        "heading": "4. Who receives information",
        "paragraphs": [
          "Relevant information is shared with airlines, hotels, travel suppliers and booking intermediaries to arrange and service your travel. Payment providers receive information needed to process or resolve transactions. These providers may also handle information under their own privacy policies and legal obligations.",
          "Our authorised staff and service providers supporting hosting, databases, email, customer relationship management and business communications may process information for these purposes. Booking, customer, itinerary and transaction details may be transferred to our customer-service system so our team can assist you.",
          "If you use WhatsApp, your messages and associated information are processed through WhatsApp/Meta's services, subject also to their applicable terms and privacy notices. We may disclose information where required by law or necessary to address fraud, security incidents or legal claims. International travel and service providers may involve processing outside India, subject to applicable legal requirements."
        ],
        "bullets": []
      },
      {
        "heading": "5. Cookies and similar storage",
        "paragraphs": [
          "We use cookies or similar identifiers for functions such as account sessions, guest searches and security. You can control cookies through your browser, although blocking necessary cookies may prevent some features from working. Any additional analytics or advertising uses must be described and accompanied by the choices required by applicable law before they are introduced."
        ],
        "bullets": []
      },
      {
        "heading": "6. WhatsApp and communication choices",
        "paragraphs": [
          "We use WhatsApp for enquiries, support and updates consistent with your permission and preferences. Reply STOP, or email cs@maxtravel.in, to ask us to stop WhatsApp messages. You may also withdraw permission for optional marketing through that email address. Opting out does not cancel a booking; necessary service information may still be provided through another appropriate channel."
        ],
        "bullets": []
      },
      {
        "heading": "7. Retention and protection",
        "paragraphs": [
          "Retention depends on the record and its purpose, including booking fulfilment, accounting, legal requirements, dispute resolution and security. Removing a saved traveller profile does not necessarily remove information already included in a booking, transaction record or backup.",
          "We use access controls and other technical and organisational measures to protect information. No online service can guarantee absolute security. Contact us promptly if you suspect unauthorised account access."
        ],
        "bullets": []
      },
      {
        "heading": "8. Access, correction and deletion requests",
        "paragraphs": [
          "Email cs@maxtravel.in with the subject “Privacy request” and describe whether you want access, correction, deletion, account closure or withdrawal of consent. Include the email address or phone number associated with your interaction and, if relevant, a booking reference. Do not include passwords, OTPs or full payment details.",
          "We may ask for proportionate information to verify your identity. We will assess and respond under applicable law, explaining any information that must be retained and why. Deletion is not an automatic cancellation or refund request. You may raise a privacy concern through the same contact and pursue remedies available under applicable law."
        ],
        "bullets": []
      },
      {
        "heading": "9. Other travellers and children",
        "paragraphs": [
          "Provide another person's information only with appropriate authority, and share this policy with them. An adult arranging travel for a child should have the necessary parental or guardian authority. Children's details should be supplied only as needed for their travel arrangements."
        ],
        "bullets": []
      },
      {
        "heading": "10. Updates",
        "paragraphs": [
          "We may update this policy as our services or legal requirements change. The current version and effective date will appear on this page. Where required, we will provide additional notice or request consent."
        ],
        "bullets": []
      }
    ]
  },
  {
    "slug": "terms-of-use",
    "title": "Terms of Use",
    "effectiveDate": "2026-10-27",
    "effectiveDateLabel": "27 October 2026",
    "intro": [
      "Business: Max Travel, a proprietorship of Moez Meghani."
    ],
    "sections": [
      {
        "heading": "1. About these terms",
        "paragraphs": [
          "These terms cover your use of maxtravel.in and travel services arranged through Max Travel. Read them together with the Privacy Policy and the fare, room, package and other booking-specific conditions presented before you confirm a purchase. Our office is in Secunderabad, India. Contact cs@maxtravel.in for assistance."
        ],
        "bullets": []
      },
      {
        "heading": "2. Using the website and your account",
        "paragraphs": [
          "You must be legally able to enter into the transaction or act with appropriate authority. If booking for others, you must have their authority to provide their information and accept the relevant booking conditions. A parent, guardian or authorised adult must arrange bookings for children.",
          "Provide accurate contact and traveller details, protect your login information and promptly report suspected unauthorised access. Do not use the website for fraudulent bookings, unlawful activity, unauthorised access or interference with its operation."
        ],
        "bullets": []
      },
      {
        "heading": "3. Travel services and supplier conditions",
        "paragraphs": [
          "Max Travel helps customers search for and arrange travel supplied by airlines, hotels and other travel providers. The applicable provider's fare, baggage, check-in, accommodation, cancellation and other service conditions form part of your booking when disclosed and accepted. Please review them carefully.",
          "Information and availability can change. Search results and enquiries do not reserve inventory. Any service marked unavailable or not open for booking cannot be purchased merely by submitting an enquiry."
        ],
        "bullets": []
      },
      {
        "heading": "4. Prices and payment",
        "paragraphs": [
          "Review the itinerary, traveller details, currency, total price, taxes, disclosed fees and cancellation conditions before authorising payment. Prices and availability may need to be checked again before booking. Any revised price requiring your agreement must be presented for acceptance; do not assume an earlier quote remains available.",
          "Use only the payment options offered through the authorised checkout or confirmed by our team. Payment processing and bank verification may be subject to the payment provider's conditions. If a payment outcome is unclear, contact us or check its status before attempting another payment."
        ],
        "bullets": []
      },
      {
        "heading": "5. Booking confirmation",
        "paragraphs": [
          "Payment success alone does not confirm travel. A booking is confirmed only when the relevant supplier confirmation or issued travel document is provided and the booking status confirms this. A pending request, quote or payment receipt is not a ticket or hotel confirmation.",
          "Check the confirmation promptly and contact us about any discrepancy. Traveller names should match the documents required for travel. You are responsible for obtaining valid passports, visas and other entry documents and meeting check-in and destination requirements. Our assistance does not guarantee admission or a visa decision."
        ],
        "bullets": []
      },
      {
        "heading": "6. Changes, cancellations and refunds",
        "paragraphs": [
          "Change and cancellation eligibility depends on the accepted booking conditions and applicable law. Contact us with your booking reference. A request is not a completed amendment or cancellation until confirmed.",
          "Where charges or fare differences apply, we will provide the applicable information for your review before proceeding when approval is required. Cancellation confirmation and refund processing are separate steps. Any refund amount and timing depend on the applicable entitlement, supplier confirmation and payment processing; contact us for the status of your specific case. Nothing in these terms overrides a refund or other remedy required by law."
        ],
        "bullets": []
      },
      {
        "heading": "7. Service problems and responsibilities",
        "paragraphs": [
          "Airlines, hotels and other suppliers operate the underlying travel services. Contact us promptly if your travel is disrupted or a service differs from its confirmation so we can assist with the available options. Website maintenance, technical failures and supplier changes may affect availability or processing.",
          "These terms do not exclude Max Travel's responsibility for its own services or remove rights and remedies that cannot lawfully be excluded. No blanket waiver of consumer rights applies."
        ],
        "bullets": []
      },
      {
        "heading": "8. Privacy and communications",
        "paragraphs": [
          "Our Privacy Policy explains how account, traveller, booking and communication information is handled. We may send necessary booking and account messages. Optional promotional communications are subject to your choices; you can ask to stop them by emailing cs@maxtravel.in. Reply STOP to stop WhatsApp messages. This does not cancel your booking."
        ],
        "bullets": []
      },
      {
        "heading": "9. Complaints and changes to these terms",
        "paragraphs": [
          "For a complaint, email cs@maxtravel.in with your booking reference and a brief description. We will review the issue and explain the next steps. You retain access to statutory complaints procedures and remedies.",
          "We may update these terms prospectively and show the revised effective date. Updated terms do not retrospectively replace the conditions accepted for an existing booking or reduce rights provided by applicable law."
        ],
        "bullets": []
      }
    ]
  },
  {
    "slug": "terms-and-conditions",
    "title": "Terms & Conditions",
    "sourceUrl": "https://maxtravel.us/term-condition",
    "intro": [
      "These Terms and Conditions govern your use of the website and services. By accessing or using our website, you agree to be bound by these Terms and Conditions. If you do not agree with any part of these terms, you may not use our services."
    ],
    "sections": [
      {
        "heading": "Use of Our Services",
        "paragraphs": [],
        "bullets": [
          "You agree to provide accurate and complete information when using our services, including during registration and booking processes.",
          "You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account."
        ]
      },
      {
        "heading": "Booking and Transactions",
        "paragraphs": [],
        "bullets": [
          "All bookings made through our website are subject to availability and confirmation by the company and our service providers.",
          "Prices displayed on our website are subject to change without prior notice. We reserve the right to modify or cancel bookings if inaccuracies are found.",
          "Payment for bookings must be made in full at the time of booking unless otherwise specified.",
          "Refunds, cancellations, and modifications to bookings are subject to our Refund and Cancellation Policy, which is outlined separately on our website."
        ]
      },
      {
        "heading": "User Content",
        "paragraphs": [],
        "bullets": [
          "By submitting content (such as reviews, comments, or feedback) to our website, you grant company a non-exclusive, royalty-free, perpetual, and worldwide license to use, reproduce, modify, adapt, publish, translate, distribute, and display such content.",
          "You are solely responsible for the content you submit, and it must not violate any third-party rights or applicable laws."
        ]
      },
      {
        "heading": "Intellectual Property",
        "paragraphs": [],
        "bullets": [
          "All content and materials on the company’s website, including but not limited to text, graphics, logos, images, and software, are the property of company or its licensors and are protected by copyright, trademark, and other intellectual property laws.",
          "You may not use, reproduce, modify, distribute, or display any content from our website without prior written consent from the company."
        ]
      },
      {
        "heading": "Limitation of Liability",
        "paragraphs": [],
        "bullets": [
          "We shall not be liable for any direct, indirect, incidental, special, or consequential damages arising out of or in any way connected with the use of our website or services, including but not limited to loss of profits, data, or goodwill.",
          "In no event shall MaxTravel's total liability to you exceed the amount paid by you for the services rendered."
        ]
      },
      {
        "heading": "Indemnification",
        "paragraphs": [
          "You agree to indemnify and hold the company harmless from any claims, damages, losses, liabilities, costs, and expenses (including legal fees) arising out of or in connection with your use of our website or services, your violation of these Terms and Conditions, or your violation of any rights of a third party."
        ],
        "bullets": []
      },
      {
        "heading": "Modifications to Terms and Conditions",
        "paragraphs": [
          "Company reserves the right to modify or update these Terms and Conditions at any time without prior notice. The updated Terms and Conditions will be effective upon posting on our website. Your continued use of our services after any such changes constitutes acceptance of the revised Terms and Conditions."
        ],
        "bullets": []
      }
    ]
  },
  {
    "slug": "cancellations-payment-policy",
    "title": "Cancellations & Payment Policy",
    "sourceUrl": "https://maxtravel.us/cancellations-payment-policy",
    "intro": [
      "This Cancellations & Payment Policy governs cancellations, refunds, and payment procedures for bookings made through the company by using our services and making bookings, you agree to adhere to the terms outlined in this policy."
    ],
    "sections": [
      {
        "heading": "Cancellations",
        "paragraphs": [],
        "bullets": [
          "Cancellation requests must be submitted in writing to company via email or through our website.",
          "Cancellation fees may apply depending on the timing of the cancellation and the terms of the booking. These fees will be outlined at the time of booking and may vary based on the service provider.",
          "Refunds for cancellations are subject to the refund policy of the specific service provider and may be processed within a specified timeframe."
        ]
      },
      {
        "heading": "Refunds",
        "paragraphs": [],
        "bullets": [
          "Refunds will be issued to the original form of payment used for the booking, unless otherwise specified by the service provider.",
          "Refunds are subject to the refund policy of the specific service provider and will be processed in a timely manner.",
          "Any applicable cancellation fees and administrative charges may be deducted from the refund amount."
        ]
      },
      {
        "heading": "Payment Procedures",
        "paragraphs": [],
        "bullets": [
          "Payment for bookings must be made in full at the time of booking unless otherwise specified.",
          "Accepted forms of payment may include credit/debit cards, bank transfers, or other electronic payment methods, as determined by the company.",
          "Failure to make payment in accordance with the specified terms may result in cancellation of the booking without further notice."
        ]
      },
      {
        "heading": "Payment Security",
        "paragraphs": [],
        "bullets": [
          "We are committed to ensuring the security of your payment information. We utilize industry-standard encryption technology to protect your personal and financial data during transactions.",
          "However, the Company shall not be liable for any unauthorized access or misuse of your payment information resulting from factors beyond our control."
        ]
      },
      {
        "heading": "Modifications to Policy",
        "paragraphs": [],
        "bullets": [
          "We reserve the right to modify or update this Cancellations & Payment Policy at any time without prior notice. The updated policy will be effective upon posting on our website.",
          "Your continued use of our services after any such changes constitutes acceptance of the revised Cancellations & Payment Policy."
        ]
      }
    ]
  },
  {
    "slug": "disclaimer",
    "title": "Disclaimer",
    "sourceUrl": "https://maxtravel.us/disclaimer",
    "intro": [
      "Welcome to our travel services platform! Before you dive into exploring our comprehensive travel offerings, please take a moment to read the following disclaimer.",
      "At our travel services, we strive to provide you with accurate and reliable information regarding our offerings. However, it's important to note that the travel industry is dynamic and subject to various factors beyond our control. While we make every effort to ensure the accuracy and completeness of the information presented on our platform, we cannot guarantee that all details will remain unchanged.",
      "As your trusted travel partner, we work with reputable service providers to bring you the best possible travel experiences. Please be aware that our services may be subject to availability, price fluctuations, and other unforeseen circumstances. We act solely as an intermediary between you, the traveler, and the service providers, and we cannot be held liable for any changes, cancellations, or disruptions to your travel plans.",
      "Before finalizing your booking with us, we recommend carefully reviewing the terms and conditions provided by both our platform and the respective service providers. By using our platform and availing of our services, you agree to abide by these terms and conditions.",
      "While we endeavor to protect your personal and financial information, we cannot be held responsible for any security breaches or unauthorized access to your data. We employ industry-standard security measures to safeguard your information, but we advise users to exercise caution when sharing sensitive information online.",
      "In no event shall our platform be liable for any direct, indirect, incidental, special, or consequential damages arising from your use of our services, including but not limited to loss of revenue, loss of profits, or loss of data.",
      "By continuing to explore our website and engage with our services, you acknowledge that you have read, understood, and accepted the terms and conditions outlined in this disclaimer. If you have any questions or concerns, please don't hesitate to contact our customer support team for assistance.",
      "Thank you for choosing us for your travel needs. We look forward to helping you create unforgettable memories!"
    ],
    "sections": []
  }
];
export function getLegalPolicy(slug:string){return legalPolicies.find(policy=>policy.slug===slug);}
export const legalContactEmail = 'cs@maxtravel.in';
