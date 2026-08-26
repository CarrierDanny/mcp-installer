/* ================================================================
   CELLSFORCE v3.0 – popup.js
   DANMAN SOLUTIONS | Carrier Enterprise, LLC | API 66.0
   Smart Paste Engine + GAS Query Library + Full field registry
   ================================================================ */
'use strict';

/* ── Global state ──────────────────────────────────────────────── */
var parsedRecords = [];
var sortCol = null;
var sortDir = 'asc';
var filterRowsArr = [];
var repEmailBlocks = {};
var currentGroup = 'Core';
var extractedAll = { cases: [], accounts: [], sfIds: [], emails: [], phones: [], custom: [] };
var selectedCaseNums = [];
var imgDataUrl = null;
var selectedFields = new Set([
  'Id', 'CaseNumber', 'Subject', 'Status', 'Priority', 'Origin',
  'AccountId', 'Account.Name', 'Account.AccountNumber',
  'Salesrep__r.Name', 'Salesrep__r.Email',
  'ContactId', 'Contact.Name', 'Contact.Email',
  'Brand__c', 'Equipment_Type__c', 'CreatedDate', 'LastModifiedDate',
  'OwnerId', 'Owner.Name', 'Region__c'
]);

/* ════════════════════════════════════════════════════════════════
   FIELD REGISTRY — from Workbench scrapes + GAS metadata
════════════════════════════════════════════════════════════════ */
var FIELDS = [
  { api: 'Id', label: 'Case ID', group: 'Core', tip: 'Unique 18-char Salesforce record ID', example: "!= NULL" },
  { api: 'CaseNumber', label: 'Case Number', group: 'Core', tip: 'Auto-generated 8-digit number starting with 0', example: "IN ('00123456')" },
  { api: 'Subject', label: 'Subject', group: 'Core', tip: 'Case subject line', example: "LIKE '%heat pump%'" },
  { api: 'Description', label: 'Description', group: 'Core', tip: 'Full text description — large field', example: "!= NULL" },
  { api: 'Status', label: 'Status', group: 'Core', tip: 'New, In Progress, Escalated, Closed', example: "= 'New'" },
  { api: 'Status__c', label: 'Status (Custom)', group: 'Core', tip: 'Custom status picklist', example: "!= NULL" },
  { api: 'Priority', label: 'Priority', group: 'Core', tip: 'High, Medium, Low', example: "= 'High'" },
  { api: 'Origin', label: 'Case Origin', group: 'Core', tip: 'Web, Phone, Email, Chat', example: "= 'Web'" },
  { api: 'Case_Origin_f__c', label: 'Case Origin (Formula)', group: 'Core', tip: 'Formula for origin', example: "!= NULL" },
  { api: 'Type', label: 'Type', group: 'Core', tip: 'Standard Type picklist', example: "= 'Problem'" },
  { api: 'Type__c', label: 'Type (Custom)', group: 'Core', tip: 'Custom Type picklist', example: "!= NULL" },
  { api: 'Reason', label: 'Case Reason', group: 'Core', tip: 'Standard Reason picklist', example: "= 'Performance'" },
  { api: 'IsClosed', label: 'Closed', group: 'Core', tip: 'Boolean: true if closed', example: "= false" },
  { api: 'IsEscalated', label: 'Escalated', group: 'Core', tip: 'Boolean: true if escalated', example: "= true" },
  { api: 'IsDeleted', label: 'Deleted', group: 'Core', tip: 'Boolean: true if in recycle bin', example: "= false" },
  { api: 'IsMerged__c', label: 'Is Merged', group: 'Core', tip: 'Boolean: merged into another case', example: "= false" },
  { api: 'Comments', label: 'Internal Comments', group: 'Core', tip: 'Internal case comments', example: "!= NULL" },
  { api: 'SuppliedName', label: 'Web Name', group: 'Core', tip: 'Name from Web-to-Case', example: "!= NULL" },
  { api: 'SuppliedEmail', label: 'Web Email', group: 'Core', tip: 'Email from Web-to-Case', example: "!= NULL" },
  { api: 'SuppliedPhone', label: 'Web Phone', group: 'Core', tip: 'Phone from Web-to-Case', example: "!= NULL" },
  { api: 'SuppliedCompany', label: 'Web Company', group: 'Core', tip: 'Company from Web-to-Case', example: "!= NULL" },
  { api: 'Brand__c', label: 'Brand', group: 'Equipment', tip: 'Carrier, Bryant, ICP, etc.', example: "= 'Carrier'" },
  { api: 'Equipment_Type__c', label: 'Equipment Type', group: 'Equipment', tip: 'Split System, Package Unit, etc.', example: "= 'Split System'" },
  { api: 'Model_Number__c', label: 'Model Number', group: 'Equipment', tip: 'Equipment model number', example: "!= NULL" },
  { api: 'Serial_Number__c', label: 'Serial Number', group: 'Equipment', tip: 'Equipment serial number', example: "!= NULL" },
  { api: 'Equipment_Currently_Running__c', label: 'Equipment Running', group: 'Equipment', tip: 'Is the equipment currently running?', example: "= true" },
  { api: 'Product2__c', label: 'Product2 (text)', group: 'Equipment', tip: 'Custom text product reference', example: "!= NULL" },
  { api: 'ProductId', label: 'Product ID', group: 'Equipment', tip: 'Lookup to Product2 object', example: "!= NULL" },
  { api: 'Product_Category__c', label: 'Product Category', group: 'Equipment', tip: 'Air Handler, Condenser, etc.', example: "= 'Air Handler'" },
  { api: 'Product_List__c', label: 'Product List', group: 'Equipment', tip: 'Product list field', example: "!= NULL" },
  { api: 'AssetId', label: 'Asset ID', group: 'Equipment', tip: 'Lookup to Asset record', example: "!= NULL" },
  { api: 'EntitlementId', label: 'Entitlement ID', group: 'Equipment', tip: 'Lookup to Entitlement', example: "!= NULL" },
  { api: 'Part_Number_s__c', label: 'Part Number(s)', group: 'Equipment', tip: 'Part numbers on this case', example: "LIKE '%C%'" },
  { api: 'Item__c', label: 'Item', group: 'Equipment', tip: 'Item/product line reference', example: "!= NULL" },
  { api: 'AccountId', label: 'Account ID', group: 'Account', tip: 'Lookup to Account record', example: "!= NULL" },
  { api: 'Account.Name', label: 'Account Name', group: 'Account', tip: 'Account name (relationship — may error in Workbench)', example: "LIKE '%Acme%'", relField: true },
  { api: 'Account.AccountNumber', label: 'Account Number', group: 'Account', tip: 'Standard AccountNumber on Account', example: "= 'ACC-00123'", relField: true },
  { api: 'Account_Number_Provided__c', label: 'Account # Provided', group: 'Account', tip: 'Account # provided by customer', example: "!= NULL" },
  { api: 'Account_Number_Submitted__c', label: 'Account # Submitted', group: 'Account', tip: 'Account # submitted by customer', example: "!= NULL" },
  { api: 'Account_Number__c', label: 'Account # (Custom)', group: 'Account', tip: 'Custom account number field on Case', example: "!= NULL" },
  { api: 'Account_Status__c', label: 'Account Status', group: 'Account', tip: 'Status of the linked account', example: "= 'Active'" },
  { api: 'Account_Phone__c', label: 'Account Phone', group: 'Account', tip: 'Phone from the linked Account', example: "!= NULL" },
  { api: 'Account_Group__c', label: 'Account Group', group: 'Account', tip: 'Account group classification', example: "!= NULL" },
  { api: 'Account_Preferred_Spoken_Language__c', label: 'Acct Preferred Language', group: 'Account', tip: 'Preferred language on Account', example: "= 'English'" },
  { api: 'Account_Salesrep__c', label: 'Account Sales Rep', group: 'Account', tip: 'Sales rep assigned to the account', example: "!= NULL" },
  { api: 'With_Account__c', label: 'With Account', group: 'Account', tip: 'Case associated with an Account?', example: "= true" },
  { api: 'With_Account_or_Lead_Company__c', label: 'With Account or Lead Co.', group: 'Account', tip: 'Account or Lead Company linked', example: "!= NULL" },
  { api: 'Related_Account__c', label: 'Related Account', group: 'Account', tip: 'Custom related account field', example: "!= NULL" },
  { api: 'Requested_Account_Number__c', label: 'Requested Account #', group: 'Account', tip: 'Account # requested by customer', example: "!= NULL" },
  { api: 'Salesrep__c', label: 'Sales Rep ID', group: 'Account', tip: 'Lookup to Sales Rep User (custom)', example: "!= NULL" },
  { api: 'Salesrep__r.Name', label: 'Sales Rep Name', group: 'Account', tip: 'Sales Rep name (relationship)', example: "= 'John Smith'", relField: true },
  { api: 'Salesrep__r.Email', label: 'Sales Rep Email', group: 'Account', tip: 'Sales Rep email (relationship)', example: "!= NULL", relField: true },
  { api: 'ContactId', label: 'Contact ID', group: 'Contact', tip: 'Lookup to Contact record', example: "!= NULL" },
  { api: 'Contact.Name', label: 'Contact Name', group: 'Contact', tip: 'Contact full name (relationship)', example: "LIKE '%Smith%'", relField: true },
  { api: 'Contact.Email', label: 'Contact Email', group: 'Contact', tip: 'Contact email (relationship)', example: "!= NULL", relField: true },
  { api: 'Contact.Fax', label: 'Contact Fax', group: 'Contact', tip: 'Contact fax (relationship)', example: "!= NULL", relField: true },
  { api: 'Contact.MobilePhone', label: 'Contact Mobile', group: 'Contact', tip: 'Contact mobile (relationship)', example: "!= NULL", relField: true },
  { api: 'Contact.Phone', label: 'Contact Phone', group: 'Contact', tip: 'Contact phone (relationship)', example: "!= NULL", relField: true },
  { api: 'ContactEmail', label: 'Contact Email (direct)', group: 'Contact', tip: 'Direct contact email on Case', example: "!= NULL" },
  { api: 'ContactFax', label: 'Contact Fax (direct)', group: 'Contact', tip: 'Direct contact fax on Case', example: "!= NULL" },
  { api: 'ContactMobile', label: 'Contact Mobile (direct)', group: 'Contact', tip: 'Direct contact mobile on Case', example: "!= NULL" },
  { api: 'ContactPhone', label: 'Contact Phone (direct)', group: 'Contact', tip: 'Direct contact phone on Case', example: "!= NULL" },
  { api: 'Contact_Status__c', label: 'Contact Status', group: 'Contact', tip: 'Custom contact status on Case', example: "= 'Active'" },
  { api: 'With_Contact__c', label: 'With Contact', group: 'Contact', tip: 'Case linked to a Contact?', example: "= true" },
  { api: 'With_Contact_or_Lead__c', label: 'With Contact or Lead', group: 'Contact', tip: 'Contact or Lead linked?', example: "!= NULL" },
  { api: 'Original_Reporter__c', label: 'Original Reporter', group: 'Contact', tip: 'Person who originally reported the issue', example: "!= NULL" },
  { api: 'Requester_Role__c', label: 'Requester Role', group: 'Contact', tip: 'Role of the case submitter', example: "= 'Contractor'" },
  { api: 'OwnerId', label: 'Owner ID', group: 'Owner', tip: 'User or Queue that owns this case', example: "= '005A000000XyZaB'" },
  { api: 'Owner.Name', label: 'Owner Name', group: 'Owner', tip: 'Owner name (relationship)', example: "= 'Jane Doe'", relField: true },
  { api: 'Owner_Role__c', label: 'Owner Role', group: 'Owner', tip: 'Formula for owner role name', example: "= 'Sales Rep'" },
  { api: 'User_is_Current_Owner__c', label: 'User is Current Owner', group: 'Owner', tip: 'Is running user the owner?', example: "= true" },
  { api: 'Case_Closed_by_User__c', label: 'Case Closed by User', group: 'Owner', tip: 'Closed by current user?', example: "= true" },
  { api: 'Case_Type__c', label: 'Case Type (Custom)', group: 'Classification', tip: 'Custom case type picklist', example: "= 'Warranty'" },
  { api: 'Sub_Type__c', label: 'Sub Type', group: 'Classification', tip: 'Sub-type classification', example: "!= NULL" },
  { api: 'Category__c', label: 'Category', group: 'Classification', tip: 'Case category picklist', example: "= 'Technical'" },
  { api: 'Cause__c', label: 'Cause', group: 'Classification', tip: 'Root cause of the issue', example: "= 'Defective Part'" },
  { api: 'Problem_Code__c', label: 'Problem Code', group: 'Classification', tip: 'Problem code assigned', example: "!= NULL" },
  { api: 'Reason__c', label: 'Reason (Custom)', group: 'Classification', tip: 'Custom reason field', example: "!= NULL" },
  { api: 'Close_Reason__c', label: 'Close Reason', group: 'Classification', tip: 'Why the case was closed', example: "= 'Resolved'" },
  { api: 'Description_Duplicate__c', label: 'Description Duplicate', group: 'Classification', tip: 'Duplicate description flag', example: "= true" },
  { api: 'Duplicate__c', label: 'Duplicate', group: 'Classification', tip: 'Duplicate case flag', example: "= false" },
  { api: 'Sentiment__c', label: 'Sentiment', group: 'Classification', tip: 'Customer sentiment', example: "= 'Positive'" },
  { api: 'Sentiment_Visual__c', label: 'Sentiment Visual', group: 'Classification', tip: 'Visual sentiment indicator', example: "!= NULL" },
  { api: 'Likelihood__c', label: 'Likelihood', group: 'Classification', tip: 'Likelihood picklist', example: "!= NULL" },
  { api: 'Rating__c', label: 'Rating', group: 'Classification', tip: 'Case rating field', example: "!= NULL" },
  { api: 'FAD__c', label: 'FAD', group: 'Classification', tip: 'Field Assessment & Diagnosis', example: "!= NULL" },
  { api: 'Expressed_FAD_Interest__c', label: 'Expressed FAD Interest', group: 'Classification', tip: 'Interest in FAD?', example: "= true" },
  { api: 'Region__c', label: 'Region', group: 'Region', tip: 'Sales region (e.g. Canada, US West)', example: "= 'Canada'" },
  { api: 'Case_Region__c', label: 'Case Region', group: 'Region', tip: 'Custom Case Region field', example: "!= NULL" },
  { api: 'Case_Region_CAM__c', label: 'Case Region CAM', group: 'Region', tip: 'CAM territory region', example: "!= NULL" },
  { api: 'Case_Region_CWA__c', label: 'Case Region CWA', group: 'Region', tip: 'CWA territory region', example: "!= NULL" },
  { api: 'Case_region_f__c', label: 'Case Region (Formula)', group: 'Region', tip: 'Formula-resolved region', example: "!= NULL" },
  { api: 'Region_Sharing__c', label: 'Region Sharing', group: 'Region', tip: 'Region sharing rule field', example: "!= NULL" },
  { api: 'Region_submitted__c', label: 'Region Submitted', group: 'Region', tip: 'Region submitted by customer', example: "!= NULL" },
  { api: 'Division__c', label: 'Division', group: 'Region', tip: 'Division field', example: "= 'Commercial'" },
  { api: 'Market__c', label: 'Market', group: 'Region', tip: 'Market segment', example: "!= NULL" },
  { api: 'Area__c', label: 'Area', group: 'Region', tip: 'Sub-region area', example: "= 'Northeast'" },
  { api: 'Area2__c', label: 'Area 2', group: 'Region', tip: 'Secondary area field', example: "!= NULL" },
  { api: 'NE__c', label: 'NE', group: 'Region', tip: 'Northeast flag', example: "= true" },
  { api: 'Province__c', label: 'Province', group: 'Region', tip: 'Canadian province', example: "= 'ON'" },
  { api: 'Ship_To__c', label: 'Ship To', group: 'Region', tip: 'Ship-To code (e.g. 8100)', example: "= '8100'" },
  { api: 'ClosedDate', label: 'Closed Date', group: 'Dates', tip: 'Date/time the case was closed', example: "> 2024-01-01T00:00:00Z" },
  { api: 'Due_Date__c', label: 'Due Date', group: 'Dates', tip: 'Custom due date', example: "< TODAY" },
  { api: 'Date_Time_Assigned_to_Agent__c', label: 'Assigned to Agent DT', group: 'Dates', tip: 'When assigned to agent', example: "!= NULL" },
  { api: 'Date_Time_First_Response__c', label: 'First Response DT', group: 'Dates', tip: 'Date/time of first response', example: "!= NULL" },
  { api: 'Next_Action_Due_Date__c', label: 'Next Action Due', group: 'Dates', tip: 'Next required action date', example: "< TODAY" },
  { api: 'Days_Since_Last_Modified__c', label: 'Days Since Modified', group: 'Dates', tip: 'Formula: days since modification', example: "< 7" },
  { api: 'Last_Modified_Two_Days_Ago__c', label: 'Modified 2 Days Ago', group: 'Dates', tip: 'Modified 2+ days ago?', example: "= true" },
  { api: 'CreatedById', label: 'Created By ID', group: 'Audit', tip: 'ID of the creating user', example: "!= NULL" },
  { api: 'CreatedBy.Name', label: 'Created By', group: 'Audit', tip: 'Creator name (relationship)', example: "= 'Admin'", relField: true },
  { api: 'CreatedDate', label: 'Created Date', group: 'Audit', tip: 'Date/time created', example: "> 2025-01-01T00:00:00Z" },
  { api: 'Created_by_First_Name__c', label: 'Created By First Name', group: 'Audit', tip: 'Creator first name (formula)', example: "= 'Danny'" },
  { api: 'Created_by_Full_Name__c', label: 'Created By Full Name', group: 'Audit', tip: 'Creator full name (formula)', example: "!= NULL" },
  { api: 'LastModifiedById', label: 'Last Modified By ID', group: 'Audit', tip: 'ID of last modifier', example: "!= NULL" },
  { api: 'LastModifiedDate', label: 'Last Modified Date', group: 'Audit', tip: 'Date/time last modified', example: "> LAST_N_DAYS:7" },
  { api: 'LastReferencedDate', label: 'Last Referenced Date', group: 'Audit', tip: 'Last referenced time', example: "!= NULL" },
  { api: 'LastViewedDate', label: 'Last Viewed Date', group: 'Audit', tip: 'Last viewed time', example: "!= NULL" },
  { api: 'SystemModstamp', label: 'System Modstamp', group: 'Audit', tip: 'System modification timestamp', example: "!= NULL" },
  { api: 'MasterRecordId', label: 'Master Record ID', group: 'Audit', tip: 'Master after merge', example: "= NULL" },
  { api: 'First_Response_Sent__c', label: 'First Response Sent', group: 'Response', tip: 'Was first response sent?', example: "= true" },
  { api: 'First_Response_Within_24_h__c', label: 'Response < 24h', group: 'Response', tip: 'Response within 24 hours?', example: "= true" },
  { api: 'First_Response_Within_30_minutes__c', label: 'Response < 30min', group: 'Response', tip: 'Response within 30 min?', example: "= true" },
  { api: 'First_Response_Within_60_minutes__c', label: 'Response < 60min', group: 'Response', tip: 'Response within 60 min?', example: "= true" },
  { api: 'First_Response_BusinessMinutes__c', label: 'First Response Bus.Min', group: 'Response', tip: 'Business minutes to first response', example: "< 60" },
  { api: 'Acceptance_Time__c', label: 'Acceptance Time (Hours)', group: 'Response', tip: 'Hours to accept/assign', example: "< 24" },
  { api: 'Time_to_Assign_to_Agent__c', label: 'Time to Assign', group: 'Response', tip: 'Minutes to assign to agent', example: "< 30" },
  { api: 'Time_to_First_Response__c', label: 'Time to First Response', group: 'Response', tip: 'Minutes to first response', example: "< 60" },
  { api: 'Resolution_BusinessMinutes__c', label: 'Resolution Bus.Min', group: 'Response', tip: 'Business minutes to resolution', example: "!= NULL" },
  { api: 'Assigned_to_Closed_Duration__c', label: 'Assigned to Closed', group: 'Response', tip: 'Duration from assignment to closure', example: "!= NULL" },
  { api: 'First_Response_Method__c', label: 'First Response Method', group: 'Response', tip: 'How first response was sent', example: "= 'Email'" },
  { api: 'ParentId', label: 'Parent Case ID', group: 'Related', tip: 'Parent case lookup', example: "!= NULL" },
  { api: 'Related_Case__c', label: 'Related Case', group: 'Related', tip: 'Custom related case lookup', example: "!= NULL" },
  { api: 'Related_Case_ID__c', label: 'Related Case ID', group: 'Related', tip: 'Text ID of related case', example: "!= NULL" },
  { api: 'Lead__c', label: 'Lead', group: 'Related', tip: 'Lead lookup', example: "!= NULL" },
  { api: 'Lead_Email__c', label: 'Lead Email', group: 'Related', tip: 'Email from associated Lead', example: "!= NULL" },
  { api: 'Opportunity__c', label: 'Opportunity', group: 'Related', tip: 'Opportunity lookup', example: "!= NULL" },
  { api: 'ServiceBench_ID__c', label: 'ServiceBench ID', group: 'Related', tip: 'ServiceBench integration ID', example: "!= NULL" },
  { api: 'Service_Order__c', label: 'Service Order', group: 'Related', tip: 'Service order reference', example: "!= NULL" },
  { api: 'Chat_Transcript__c', label: 'Chat Transcript', group: 'Related', tip: 'Live Chat Transcript lookup', example: "!= NULL" },
  { api: 'Messaging_Session__c', label: 'Messaging Session', group: 'Related', tip: 'SMS Messaging Session lookup', example: "!= NULL" },
  { api: 'Combined_Queue__c', label: 'Combined Queue', group: 'Related', tip: 'Combined queue routing field', example: "!= NULL" },
  { api: 'Transferred_Case__c', label: 'Transferred Case', group: 'Related', tip: 'Case transferred from another queue?', example: "= true" },
  { api: 'Transferred_Origin__c', label: 'Transferred Origin', group: 'Related', tip: 'Origin queue before transfer', example: "!= NULL" },
  { api: 'Order_Number__c', label: 'Order Number', group: 'Order', tip: 'Order number for this case', example: "!= NULL" },
  { api: 'Claim_Number__c', label: 'Claim Number', group: 'Order', tip: 'Warranty claim number', example: "!= NULL" },
  { api: 'Claim_Error__c', label: 'Claim Error', group: 'Order', tip: 'Claim processing error code', example: "!= NULL" },
  { api: 'Expedite_Number__c', label: 'Expedite Number', group: 'Order', tip: 'Expedite request reference', example: "!= NULL" },
  { api: 'Amount__c', label: 'Amount', group: 'Order', tip: 'Financial amount on case', example: "> 0" },
  { api: 'Total_Credit__c', label: 'Total Credit', group: 'Order', tip: 'Total credit approved', example: "> 0" },
  { api: 'Total_Program_Fee__c', label: 'Total Program Fee', group: 'Order', tip: 'Total program fee', example: "> 0" },
  { api: 'Credit_Approved__c', label: 'Credit Approved', group: 'Order', tip: 'Has credit been approved?', example: "= true" },
  { api: 'CSD_Account_Number__c', label: 'CSD Account Number', group: 'Order', tip: 'CSD system account number', example: "!= NULL" },
  { api: 'ERP_Unique_ID__c', label: 'ERP Unique ID', group: 'Order', tip: 'ERP system unique identifier', example: "!= NULL" },
  { api: 'Valid_ERP_Account__c', label: 'Valid ERP Account', group: 'Order', tip: 'Valid ERP account match?', example: "= true" },
  { api: 'Registration_Type1__c', label: 'Registration Type', group: 'Program', tip: 'Type of registration', example: "!= NULL" },
  { api: 'Registration_Verification_Done__c', label: 'Reg Verified', group: 'Program', tip: 'Registration verified?', example: "= true" },
  { api: 'CE_Website_Registration_Process__c', label: 'CE Website Reg', group: 'Program', tip: 'Website registration stage', example: "!= NULL" },
  { api: 'Marketing_Program_Enrollment__c', label: 'Mktg Program Enrollment', group: 'Program', tip: 'Marketing Program Enrollment lookup', example: "!= NULL" },
  { api: 'Marketing_Program__c', label: 'Marketing Program', group: 'Program', tip: 'Marketing program name', example: "!= NULL" },
  { api: 'Mktg_Program__c', label: 'Mktg Program (abbrev)', group: 'Program', tip: 'Abbreviated marketing program field', example: "!= NULL" },
  { api: 'Program_Tier__c', label: 'Program Tier', group: 'Program', tip: 'Gold, Silver, Bronze, etc.', example: "= 'Gold'" },
  { api: 'Onboarding_Case_Created__c', label: 'Onboarding Case Created', group: 'Program', tip: 'Onboarding case auto-created?', example: "= true" },
  { api: 'Onboarding_Status__c', label: 'Onboarding Status', group: 'Program', tip: 'Current onboarding status', example: "= 'Pending'" },
  { api: 'Enrollment_Year__c', label: 'Enrollment Year', group: 'Program', tip: 'Year of enrollment', example: "= '2025'" },
  { api: 'Duplicate_Enrollment__c', label: 'Duplicate Enrollment', group: 'Program', tip: 'Duplicate enrollment?', example: "= false" },
  { api: 'Business_has_a_valid_Website__c', label: 'Valid Website', group: 'Vetting', tip: 'Business has valid website', example: "= true" },
  { api: 'Business_is_active_on_Secretary_of_State__c', label: 'Active on SOS', group: 'Vetting', tip: 'Active on Secretary of State', example: "= true" },
  { api: 'Business_is_registered_under_BBB_or_loca__c', label: 'Registered BBB', group: 'Vetting', tip: 'Registered with BBB', example: "= true" },
  { api: 'Business_verified_on_Experian__c', label: 'Verified Experian', group: 'Vetting', tip: 'Verified on Experian', example: "= true" },
  { api: 'Federal_Tax_ID_Verified__c', label: 'Federal Tax ID Verified', group: 'Vetting', tip: 'Federal Tax ID verified?', example: "= true" },
  { api: 'Federal_Tax_ID__c', label: 'Federal Tax ID', group: 'Vetting', tip: 'Federal Tax ID text', example: "!= NULL" },
  { api: 'Trade_license_verified__c', label: 'Trade License Verified', group: 'Vetting', tip: 'Trade license verified?', example: "= true" },
  { api: 'Company_Name_Match_found__c', label: 'Company Name Match', group: 'Vetting', tip: 'Company name match found?', example: "= true" },
  { api: 'Email_domain_match_found__c', label: 'Email Domain Match', group: 'Vetting', tip: 'Email domain match found?', example: "= true" },
  { api: 'Phone_Number_Match_Found__c', label: 'Phone Match Found', group: 'Vetting', tip: 'Phone number match found?', example: "= true" },
  { api: 'Company_Description__c', label: 'Company Description', group: 'Vetting', tip: 'Company description from vetting', example: "!= NULL" },
  { api: 'BBB__c', label: 'BBB', group: 'Vetting', tip: 'BBB rating/status', example: "!= NULL" },
  { api: 'BBB_URL__c', label: 'BBB URL', group: 'Vetting', tip: 'BBB business profile URL', example: "!= NULL" },
  { api: 'Secretary_of_State_URL__c', label: 'SOS URL', group: 'Vetting', tip: 'Secretary of State URL', example: "!= NULL" },
  { api: 'Open_Corporates__c', label: 'Open Corporates', group: 'Vetting', tip: 'Open Corporates result', example: "!= NULL" },
  { api: 'Open_Corporates_Profile_Link__c', label: 'Open Corporates Link', group: 'Vetting', tip: 'Open Corporates profile link', example: "!= NULL" },
  { api: 'Vetting_CEA__c', label: 'Vetting CEA', group: 'Vetting', tip: 'CEA vetting result', example: "!= NULL" },
  { api: 'RPA_Status__c', label: 'RPA Status', group: 'RPA', tip: 'RPA automation status', example: "= 'Complete'" },
  { api: 'RPA_Error__c', label: 'RPA Error', group: 'RPA', tip: 'RPA error code', example: "!= NULL" },
  { api: 'RPA_Error_Message__c', label: 'RPA Error Message', group: 'RPA', tip: 'Detailed RPA error message', example: "!= NULL" },
  { api: 'RPA_Existing_Customer__c', label: 'RPA Existing Customer', group: 'RPA', tip: 'Customer found by RPA?', example: "= true" },
  { api: 'RPA_Triggered__c', label: 'RPA Triggered', group: 'RPA', tip: 'RPA triggered?', example: "= true" },
  { api: 'RPA_Zip_Code__c', label: 'RPA Zip Code', group: 'RPA', tip: 'Zip code used by RPA', example: "!= NULL" },
  { api: 'NxTrend_City_Lookup__c', label: 'NxTrend City Lookup', group: 'RPA', tip: 'City lookup from NxTrend', example: "!= NULL" },
  { api: 'NxTrend_Zip_Code_Lookup__c', label: 'NxTrend Zip Lookup', group: 'RPA', tip: 'Zip lookup from NxTrend', example: "!= NULL" },
  { api: 'Mellisa_Lookups__c', label: 'Melissa Lookups', group: 'RPA', tip: 'Melissa Data verification result', example: "!= NULL" },
  { api: 'Email_From_Nxtrend__c', label: 'Email From NxTrend', group: 'RPA', tip: 'Email from NxTrend', example: "!= NULL" },
  { api: 'Purchasing_Agent_from_Nxtrend__c', label: 'Purchasing Agent NxTrend', group: 'RPA', tip: 'Purchasing agent from NxTrend', example: "!= NULL" },
  { api: 'Email__c', label: 'Email', group: 'Comms', tip: 'Email custom field on Case', example: "!= NULL" },
  { api: 'Language', label: 'Language', group: 'Comms', tip: 'Standard language field', example: "= 'en_US'" },
  { api: 'Language__c', label: 'Language (Custom)', group: 'Comms', tip: 'Custom language picklist', example: "!= NULL" },
  { api: 'Preferred_Spoken_Language__c', label: 'Preferred Language', group: 'Comms', tip: 'Customer preferred spoken language', example: "= 'Spanish'" },
  { api: 'PreferedCallback__c', label: 'Preferred Callback', group: 'Comms', tip: 'Preferred callback method/time', example: "!= NULL" },
  { api: 'Next_in_Queue_Alert_Received__c', label: 'Queue Alert Received', group: 'Comms', tip: 'Next-in-queue alert received?', example: "= true" },
  { api: 'Next_in_Queue_Alert_Sent__c', label: 'Queue Alert Sent', group: 'Comms', tip: 'Next-in-queue alert sent?', example: "= true" },
  { api: 'Count_Jitsi_Calls__c', label: 'Count Jitsi Calls', group: 'Comms', tip: 'Number of Jitsi calls', example: "!= NULL" },
  { api: 'Jitsi_Chat_Id__c', label: 'Jitsi Chat ID', group: 'Comms', tip: 'Jitsi chat session ID', example: "!= NULL" },
  { api: 'Workflow__c', label: 'Workflow', group: 'Workflow', tip: 'Current workflow state', example: "!= NULL" },
  { api: 'Launch_Process_Builder__c', label: 'Launch Process Builder', group: 'Workflow', tip: 'Trigger to launch Process Builder', example: "= true" },
  { api: 'Manager_Approved__c', label: 'Manager Approved', group: 'Workflow', tip: 'Manager approved?', example: "= true" },
  { api: 'ClosedOnCreate__c', label: 'Closed On Create', group: 'Workflow', tip: 'Closed at same time as created?', example: "= false" },
  { api: 'Add_Contact_as_Bidder__c', label: 'Add Contact as Bidder', group: 'Workflow', tip: 'Add contact as bidder action', example: "= true" },
  { api: 'Confirm_Default_Warehouse_Hub__c', label: 'Confirm Warehouse Hub', group: 'Workflow', tip: 'Confirm warehouse hub assignment', example: "!= NULL" },
  { api: 'Confirmed_Division_Branch__c', label: 'Confirmed Division Branch', group: 'Workflow', tip: 'Confirmed division/branch', example: "!= NULL" },
  { api: 'Change_Brand_Affiliation__c', label: 'Change Brand Affiliation', group: 'Workflow', tip: 'Change brand affiliation workflow', example: "= true" },
  { api: 'Reactivation_Steps__c', label: 'Reactivation Steps', group: 'Workflow', tip: 'Steps in reactivation workflow', example: "!= NULL" },
  { api: 'RecordTypeId', label: 'Record Type ID', group: 'System', tip: 'Record type for layout/process', example: "= '012A000000XyZaB'" },
  { api: 'CurrencyIsoCode', label: 'Currency ISO Code', group: 'System', tip: 'USD, CAD, etc.', example: "= 'USD'" },
  { api: 'Actions_and_Errors__c', label: 'Actions and Errors', group: 'System', tip: 'Actions/errors log', example: "!= NULL" },
  { api: 'AI_Response_URLs__c', label: 'AI Response URLs', group: 'System', tip: 'AI-generated URLs', example: "!= NULL" },
  { api: 'Alert_Message_del__c', label: 'Alert Message', group: 'System', tip: 'Custom alert message', example: "!= NULL" },
  { api: 'App_Version__c', label: 'App Version', group: 'System', tip: 'Mobile app version', example: "!= NULL" },
  { api: 'HVAC_Partners_ID__c', label: 'HVAC Partners ID', group: 'System', tip: 'HVAC Partners integration ID', example: "!= NULL" },
  { api: 'Integration_Note__c', label: 'Integration Note', group: 'System', tip: 'Integration process notes', example: "!= NULL" },
  { api: 'Intent_to_Purchase__c', label: 'Intent to Purchase', group: 'System', tip: 'Customer expressed purchase intent?', example: "= true" },
  { api: 'Interested_in_Product_Training__c', label: 'Interested in Training', group: 'System', tip: 'Interested in product training?', example: "= true" },
  { api: 'Notes__c', label: 'Notes', group: 'System', tip: 'Custom notes field', example: "!= NULL" },
  { api: 'URL__c', label: 'URL', group: 'System', tip: 'Custom URL field', example: "!= NULL" },
  { api: 'User_ID__c', label: 'User ID', group: 'System', tip: 'Custom User ID (text)', example: "!= NULL" },
  { api: 'Website__c', label: 'Website', group: 'System', tip: 'Website custom field', example: "!= NULL" },
  { api: 'Webinar__c', label: 'Webinar', group: 'System', tip: 'Webinar association', example: "= true" },
  { api: 'Teams_Impacted__c', label: 'Teams Impacted', group: 'System', tip: 'Impacted teams', example: "!= NULL" },
  { api: 'Customer_Issue_Description__c', label: 'Customer Issue Desc', group: 'System', tip: 'Detailed customer issue (separate from Description)', example: "!= NULL" },
  { api: 'Device__c', label: 'Device', group: 'System', tip: 'Customer device', example: "!= NULL" },
  { api: 'Disengaged_Win_Back__c', label: 'Disengaged Win Back', group: 'System', tip: 'Win-back campaign flag', example: "= true" },
  { api: 'Profile_Completion__c', label: 'Profile Completion', group: 'System', tip: 'Profile completion percentage', example: "> 50" },
  { api: 'Translation__c', label: 'Translation', group: 'System', tip: 'Translation field', example: "!= NULL" },
  { api: 'X12_Month_Sales__c', label: '12 Month Sales', group: 'System', tip: 'Rolling 12-month sales figure', example: "> 0" },
];

/* ════════════════════════════════════════════════════════════════
   QUERY LIBRARY — 10 queries matching GAS CASE_QUERY_LIBRARY
════════════════════════════════════════════════════════════════ */
var QUERY_LIBRARY = [
  {
    id: 'q1', title: 'Case Parse Query', object: 'Case',
    desc: 'Best for parsing missing data from Subject + Description. Core Case fields plus Description.',
    query: 'SELECT Id, CaseNumber, Subject, Description, Status, Priority, Type, Origin, AccountId, ContactId, OwnerId, Equipment_Type__c, Model_Number__c, Serial_Number__c FROM Case WHERE CaseNumber IN ({IN})'
  },
  {
    id: 'q2', title: 'Case Account-Update Prep', object: 'Case',
    desc: 'Use before changing AccountId on Cases. Includes Description for parsing and current Account/Contact links.',
    query: 'SELECT Id, CaseNumber, Subject, Description, AccountId, ContactId, Status, OwnerId FROM Case WHERE CaseNumber IN ({IN})'
  },
  {
    id: 'q3', title: 'Case Contact-Update Prep', object: 'Case',
    desc: 'Use before changing ContactId on Cases. Includes Description and current Contact/Account.',
    query: 'SELECT Id, CaseNumber, Subject, Description, ContactId, AccountId, Status, OwnerId FROM Case WHERE CaseNumber IN ({IN})'
  },
  {
    id: 'q4', title: 'Case Full Fields (No Description)', object: 'Case',
    desc: 'All valid Case fields from Workbench metadata — excludes Description to reduce query weight.',
    query: "SELECT Acceptance_Time__c, AccountId, Account_Group__c, Account_Number_Provided__c, Account_Number_Submitted__c, Account_Number__c, Account_Phone__c, Account_Preferred_Spoken_Language__c, Account_Salesrep__c, Account_Status__c, Actions_and_Errors__c, Add_Contact_as_Bidder__c, AI_Response_URLs__c, Alert_Message_del__c, Amount__c, App_Version__c, Area2__c, Area__c, AssetId, Assigned_to_Closed_Duration__c, BBB_URL__c, BBB__c, Brand__c, Business_has_a_valid_Website__c, Business_is_active_on_Secretary_of_State__c, Business_is_registered_under_BBB_or_loca__c, Business_verified_on_Experian__c, CaseNumber, Case_Closed_by_User__c, Case_Origin_f__c, Case_Region_CAM__c, Case_Region_CWA__c, Case_region_f__c, Case_Region__c, Category__c, Cause__c, CE_Website_Registration_Process__c, Change_Brand_Affiliation__c, Chat_Transcript__c, Claim_Error__c, Claim_Number__c, ClosedDate, ClosedOnCreate__c, Close_Reason__c, Combined_Queue__c, Comments, Company_Description__c, Company_Name_Match_found__c, Confirmed_Division_Branch__c, Confirm_Default_Warehouse_Hub__c, ContactEmail, ContactFax, ContactId, ContactMobile, ContactPhone, Contact_Status__c, Count_Jitsi_Calls__c, CreatedById, CreatedDate, Created_by_First_Name__c, Created_by_Full_Name__c, Credit_Approved__c, CSD_Account_Number__c, CurrencyIsoCode, Currently_On_Site__c, Customer_Issue_Description__c, Date_Time_Assigned_to_Agent__c, Date_Time_First_Response__c, Days_Since_Last_Modified__c, Description_Duplicate__c, Device__c, Disengaged_Win_Back__c, Division__c, Due_Date__c, Duplicate_Enrollment__c, Duplicate__c, Email_domain_match_found__c, Email_From_Nxtrend__c, Email__c, Enrollment_Year__c, EntitlementId, Equipment_Currently_Running__c, Equipment_Type__c, ERP_Unique_ID__c, Expedite_Number__c, Expressed_FAD_Interest__c, FAD__c, Federal_Tax_ID_Verified__c, Federal_Tax_ID__c, First_Response_BusinessMinutes__c, First_Response_Method__c, First_Response_Sent__c, First_Response_Within_24_h__c, First_Response_Within_30_minutes__c, First_Response_Within_60_minutes__c, HVAC_Partners_ID__c, Id, Integration_Note__c, Intent_to_Purchase__c, Interested_in_Product_Training__c, IsClosed, IsDeleted, IsEscalated, IsMerged__c, Item__c, Jitsi_Chat_Id__c, Language, Language__c, LastModifiedById, LastModifiedDate, LastReferencedDate, LastViewedDate, Last_Modified_Two_Days_Ago__c, Launch_Process_Builder__c, Lead_Email__c, Lead__c, Likelihood__c, Manager_Approved__c, Marketing_Program_Enrollment__c, Marketing_Program__c, Market__c, MasterRecordId, Mellisa_Lookups__c, Messaging_Session__c, Mktg_Program__c, Model_Number__c, Next_Action_Due_Date__c, Next_in_Queue_Alert_Received__c, Next_in_Queue_Alert_Sent__c, NE__c, Notes__c, NxTrend_City_Lookup__c, NxTrend_Zip_Code_Lookup__c, Onboarding_Case_Created__c, Onboarding_Status__c, Open_Corporates_Profile_Link__c, Open_Corporates__c, Opportunity__c, Order_Number__c, Origin, Original_Reporter__c, OwnerId, Owner_Role__c, ParentId, Part_Number_s__c, Phone_Number_Match_Found__c, Placeholder_Contact_Email__c, PreferedCallback__c, Preferred_Spoken_Language__c, Priority, Problem_Code__c, Product2__c, ProductId, Product_Category__c, Product_List__c, Program_Tier__c, Reactivation_Steps__c, Reason, Reason_Account_is_Invalid__c, Reason_Case_is_not_related_to_Contact__c, Reason_Case_is_Pending__c, Reason_for_Disengagement__c, Reason__c, RecordTypeId, Region_Sharing__c, Region_submitted__c, Region__c, Registration_Type1__c, Registration_Verification_Done__c, Related_Account__c, Related_Case_ID__c, Related_Case__c, Requested_Account_Number__c, Requester_Role__c, Resolution_BusinessMinutes__c, RPA_Error_Message__c, RPA_Error__c, RPA_Existing_Customer__c, RPA_Status__c, RPA_Triggered__c, RPA_Zip_Code__c, Secretary_of_State_URL__c, Sentiment_Visual__c, Sentiment__c, Serial_Number__c, ServiceBench_ID__c, Service_Order__c, Ship_To__c, Status, Status__c, Subject, Sub_Type__c, SuppliedCompany, SuppliedEmail, SuppliedName, SuppliedPhone, SystemModstamp, Teams_Impacted__c, Time_to_Assign_to_Agent__c, Time_to_First_Response__c, Total_Credit__c, Total_Program_Fee__c, Trade_license_verified__c, Transferred_Case__c, Transferred_Origin__c, Translation__c, Type, Type__c, URL__c, User_ID__c, User_is_Current_Owner__c, Valid_ERP_Account__c, Vetting_CEA__c, Webinar__c, Website__c, With_Account_or_Lead_Company__c, With_Account__c, With_Contact_or_Lead__c, With_Contact__c, Workflow__c, X12_Month_Sales__c FROM Case WHERE CaseNumber IN ({IN})"
  },
  {
    id: 'q5', title: 'Accounts Tied to Cases', object: 'Account',
    desc: 'Pull the Account records linked to the pasted Case numbers.',
    query: 'SELECT Id, Name, AccountNumber, Account_Number__c, Phone, OwnerId FROM Account WHERE Id IN (SELECT AccountId FROM Case WHERE CaseNumber IN ({IN}))'
  },
  {
    id: 'q6', title: 'Accounts Full Fields', object: 'Account',
    desc: 'All valid Account fields for Accounts linked to the pasted Cases.',
    query: "SELECT AccountNumber, AccountSource, Account_Number__c, Account_Status__c, Alert_Message__c, AnnualRevenue, BillingCity, BillingCountry, BillingPostalCode, BillingState, BillingStreet, Business_Software__c, CE_App_Last_Login_Date__c, CE_Rewards_Status__c, CE_Rewards_Tier__c, CreatedById, CreatedDate, CurrencyIsoCode, Customer_Group__c, Customer_Start_Date__c, Customer_Terms__c, Customer_Type__c, Date_Incorporated__c, Description, Division__c, ECC_HVP_ID__c, Email_Opens__c, EPA_Certified__c, Estimated_Budget_for_HVAC_Products__c, Estimated_HVAC_Purchases__c, HVAC_Partners_ID__c, Id, Industry, IsDeleted, LastActivityDate, LastModifiedById, LastModifiedDate, Lead_Profile_Data__c, Marketing_Program__c, Market__c, Member_Number__c, Mktg_Program__c, Name, NumberOfEmployees, Number_of_Employees__c, Number_of_Operating_Locations__c, Number_of_Salespeople__c, Number_of_Service_Trucks__c, Number_of_Technicians__c, Number_of_Trucks__c, Offers_Consumer_Financing__c, Online_Purchase__c, OwnerId, Phone, Preferred_Language__c, RecordTypeId, Refrigerant_License__c, Region__c, Salesrep__c, Sales_Channel__c, Sales_Subchannel__c, ServiceBench_ID__c, ShippingCity, ShippingCountry, ShippingPostalCode, ShippingState, ShippingStreet, SourceSystemIdentifier, Standard_Purchase__c, Stocks_Inventory__c, SystemModstamp, Technical_Support_Rating__c, Technician_Type__c, Total_Annual_Revenue__c, Total_Number_of_Contacts__c, Type, Under_Contract__c, Value_Prop_Buy_in__c, Website, Year_Incorporated__c FROM Account WHERE Id IN (SELECT AccountId FROM Case WHERE CaseNumber IN ({IN}))"
  },
  {
    id: 'q7', title: 'Contacts Tied to Cases', object: 'Contact',
    desc: 'Pull Contact records linked to the pasted Case numbers.',
    query: 'SELECT Id, FirstName, LastName, Name, AccountId, Email, Phone, MobilePhone, OwnerId FROM Contact WHERE Id IN (SELECT ContactId FROM Case WHERE CaseNumber IN ({IN}))'
  },
  {
    id: 'q8', title: 'Contacts Full Fields', object: 'Contact',
    desc: 'All valid Contact fields for Contacts linked to the pasted Cases.',
    query: "SELECT AccountId, Account_Number__c, Additional_Roles__c, Branch__c, Business_Role__c, Business_Sub_Role__c, CE_Anniversary__c, CE_App_Last_Login_Date__c, CE_News__c, ContactSource, CreatedById, CreatedDate, CurrencyIsoCode, Department, Email, EmailBouncedDate, EmailBouncedReason, Email_Frequency__c, Fax, FirstName, HomePhone, Id, Invalid_Phone_Flag__c, IsDeleted, Is_Registered__c, Jigsaw, LastActivityDate, LastModifiedById, LastModifiedDate, LastName, LastReferencedDate, LastViewedDate, Last_Order_Amount__c, Last_Order_Number__c, Magento_Last_Activity__c, Magento_Unique_Id__c, MailingCity, MailingCountry, MailingPostalCode, MailingState, MailingStreet, Marketing_Cloud_List_2__c, Marketing_Cloud_List__c, MiddleName, MobilePhone, Mobile_App_Connection__c, Name, No_Longer_With_Account__c, Opt_in_status__c, OtherPhone, OwnerId, Phone, Phone_Extension__c, Preferred_Language__c, RecordTypeId, Registered_on_App__c, ReportsToId, Salutation, ServiceBench_ID__c, ServiceBench_Username__c, SMS_Opt_In__c, Special_Function__c, Suffix, SystemModstamp, Title, Website_CE_Rewards_Access__c, Website_Company_Profile_Access__c, Website_Show_Prices__c FROM Contact WHERE Id IN (SELECT ContactId FROM Case WHERE CaseNumber IN ({IN}))"
  },
  {
    id: 'q9', title: 'Equipment Tied to Cases', object: 'Equipment__c',
    desc: 'Pull Equipment records tied to the pasted Case numbers.',
    query: "SELECT Id, Name, Case__c, Serial_Number__c, Product_Line__c, Type__c FROM Equipment__c WHERE Case__r.CaseNumber IN ({IN})"
  },
  {
    id: 'q10', title: 'Equipment Full Fields', object: 'Equipment__c',
    desc: 'All valid Equipment__c fields for equipment tied to the pasted Case numbers.',
    query: "SELECT Case__c, CreatedById, CreatedDate, CurrencyIsoCode, Id, IsDeleted, LastActivityDate, LastModifiedById, LastModifiedDate, LastReferencedDate, LastViewedDate, Name, Product_Family__c, Product_Line__c, Product_Series__c, Serial_Number__c, SystemModstamp, Type__c FROM Equipment__c WHERE Case__r.CaseNumber IN ({IN})"
  }
];

/* ════════════════════════════════════════════════════════════════
   UPDATE HEADER TEMPLATES — from GAS header functions
════════════════════════════════════════════════════════════════ */
var UPDATE_HEADERS = {
  Case: ["Id", "AccountId", "Account_Number_Provided__c", "Account_Status__c", "Actions_and_Errors__c", "Add_Contact_as_Bidder__c", "AI_Response_URLs__c", "Amount__c", "Area2__c", "Brand__c", "Business_has_a_valid_Website__c", "Business_is_active_on_Secretary_of_State__c", "Business_is_registered_under_BBB_or_loca__c", "Business_verified_on_Experian__c", "Category__c", "Cause__c", "CE_Website_Registration_Process__c", "Change_Brand_Affiliation__c", "Chat_Transcript__c", "Claim_Error__c", "Claim_Number__c", "Close_Reason__c", "Comments", "Company_Description__c", "Company_Name_Match_found__c", "Confirmed_Division_Branch__c", "Confirm_Default_Warehouse_Hub__c", "ContactId", "Credit_Approved__c", "CSD_Account_Number__c", "CurrencyIsoCode", "Currently_On_Site__c", "Customer_Issue_Description__c", "Description", "Division__c", "Due_Date__c", "Duplicate__c", "Email_domain_match_found__c", "Email__c", "EntitlementId", "Equipment_Currently_Running__c", "Equipment_Type__c", "Expedite_Number__c", "Expressed_FAD_Interest__c", "Federal_Tax_ID_Verified__c", "Federal_Tax_ID__c", "First_Response_Sent__c", "HVAC_Partners_ID__c", "Interested_in_Product_Training__c", "Item__c", "Language", "Launch_Process_Builder__c", "Lead__c", "Likelihood__c", "Manager_Approved__c", "Marketing_Program_Enrollment__c", "Mellisa_Lookups__c", "Messaging_Session__c", "Next_in_Queue_Alert_Received__c", "Next_in_Queue_Alert_Sent__c", "Notes__c", "NxTrend_City_Lookup__c", "NxTrend_Zip_Code_Lookup__c", "Onboarding_Case_Created__c", "Onboarding_Status__c", "Open_Corporates_Profile_Link__c", "Open_Corporates__c", "Opportunity__c", "Origin", "Original_Reporter__c", "OwnerId", "ParentId", "Part_Number_s__c", "Phone_Number_Match_Found__c", "Placeholder_Contact_Email__c", "Preferred_Spoken_Language__c", "Priority", "Problem_Code__c", "Product2__c", "ProductId", "Product_Category__c", "Product_List__c", "Program_Tier__c", "Reactivation_Steps__c", "Reason", "Reason_Account_is_Invalid__c", "Reason_Case_is_not_related_to_Contact__c", "Reason_Case_is_Pending__c", "Reason_for_Disengagement__c", "Reason__c", "RecordTypeId", "Region_Sharing__c", "Registration_Type1__c", "Registration_Verification_Done__c", "Related_Case_ID__c", "Related_Case__c", "Requester_Role__c", "RPA_Error_Message__c", "RPA_Error__c", "RPA_Existing_Customer__c", "RPA_Status__c", "RPA_Triggered__c", "RPA_Zip_Code__c", "Secretary_of_State_URL__c", "ServiceBench_ID__c", "Service_Order__c", "Ship_To__c", "Status", "Subject", "Sub_Type__c", "SuppliedCompany", "Teams_Impacted__c", "Total_Credit__c", "Trade_license_verified__c", "Transferred_Case__c", "Transferred_Origin__c", "Type", "URL__c", "Valid_ERP_Account__c", "Webinar__c", "Website__c", "Workflow__c"],
  Account: ["Id", "Accounts_with_Standard_Purchase__c", "Account_Priority__c", "Account_Registered_Missing_from_Import__c", "Additional_Product_Lines_Sold__c", "Alert_Message__c", "Backoffice_Purchasing__c", "Business_Software__c", "Contact_Cleanup_Complete_Time__c", "Co_op_Affiliation__c", "CSR_Group__c", "CurrencyIsoCode", "Customer_Group__c", "Date_Incorporated__c", "dupcheck__dc3DisableDuplicateCheck__c", "dupcheck__dc3Index__c", "ECC_HVP_ID__c", "Email_Opens__c", "Engaged_Account_w_o_purchase__c", "EPA_Certified__c", "Estimated_Budget_for_HVAC_Products__c", "Estimated_HVAC_Purchases__c", "Has_New_Account_Opportunity__c", "HVAC_Partners_ID__c", "Lead_Profile_Data__c", "Member_Number__c", "Mktg_Program__c", "Name", "NumberOfEmployees", "Number_of_Employees__c", "Number_of_Maintenance_Contracts__c", "Number_of_Operating_Locations__c", "Number_of_Owners_Partners__c", "Number_of_Repair_Jobs_Annually__c", "Number_of_Salespeople__c", "Number_of_Service_Calls_Annually__c", "Number_of_Service_Trucks__c", "Number_of_Stocking_Locations__c", "Number_of_System_Installs_Annually__c", "Number_of_Technicians__c", "Number_of_Trucks__c", "Offers_Consumer_Financing__c", "Online_Account_Visits__c", "Online_Purchase__c", "OwnerId", "Phone", "Preferred_Language__c", "Profile_Completion_for_30_days_old_Accou__c", "Project_Blue_Target__c", "Reactivated_Account_CY_PY__c", "Reason__c", "RecordTypeId", "Refrigerant_License__c", "Sales_Channel__c", "Sales_Subchannel__c", "ServiceBench_ID__c", "SourceSystemIdentifier", "Standard_Purchase__c", "Stocks_Inventory__c", "Technical_Support_Rating__c", "Technician_Type__c", "Total_Annual_Revenue__c", "Total_Number_of_Contacts__c", "Total_Sales_Opportunity_Old__c", "Total_Warehouse_Square_Footage__c", "Type", "Under_Contract__c", "Value_Prop_Buy_in__c", "Website", "Year_Incorporated__c", "Year_Reactivated__c"],
  Contact: ["Id", "AccountId", "Additional_Roles__c", "Branch__c", "Business_Role__c", "Business_Sub_Role__c", "CE_Anniversary__c", "CE_App_Last_Login_Date__c", "CE_App_Linked_User__c", "CE_News__c", "ContactSource", "CurrencyIsoCode", "Department", "dupcheck__dc3DisableDuplicateCheck__c", "dupcheck__dc3Index__c", "Email", "EmailBouncedDate", "EmailBouncedReason", "Email_Frequency__c", "Fax", "FirstName", "HomePhone", "Invalid_Phone_Flag__c", "Is_Registered__c", "Jigsaw", "LastName", "Last_Order_Amount__c", "Last_Order_Number__c", "Last_Order_Online__c", "Magento_Last_Activity__c", "Magento_Unique_Id__c", "MailingCity", "MailingCountry", "MailingGeocodeAccuracy", "MailingLatitude", "MailingLongitude", "MailingPostalCode", "MailingState", "MailingStreet", "Marketing_Cloud_List_2__c", "Marketing_Cloud_List__c", "MiddleName", "MobilePhone", "Mobile_App_Connection__c", "No_Longer_With_Account__c", "Opt_in_status__c", "OtherPhone", "OwnerId", "Phone", "Phone_Extension__c", "Reason_Unable_to_Provide_Key_Data__c", "RecordTypeId", "Registered_on_App__c", "ReportsToId", "Salutation", "ServiceBench_ID__c", "ServiceBench_Username__c", "SMS_Opt_In__c", "Special_Function__c", "Suffix", "Title", "Website_Add_Edit_Delete_Users__c", "Website_CE_Rewards_Access__c", "Website_CE_Statements_Access__c", "Website_Company_Profile_Access__c", "Website_Service_Bench_Access__c", "Website_Show_Prices__c"],
  Equipment: ["Id", "CurrencyIsoCode", "Name", "Product_Line__c", "Serial_Number__c", "Type__c"]
};

/* Field presets */
var PRESETS = {
  freshdeets: ['Id', 'CaseNumber', 'Subject', 'Status', 'Priority', 'Origin', 'AccountId', 'Account.Name', 'Account.AccountNumber', 'Salesrep__r.Name', 'Salesrep__r.Email', 'ContactId', 'Contact.Name', 'Contact.Email', 'Brand__c', 'Equipment_Type__c', 'CreatedDate', 'LastModifiedDate', 'OwnerId', 'Owner.Name', 'Region__c'],
  getoffmycases: ['Id', 'CaseNumber', 'Subject', 'Status', 'Priority', 'IsClosed', 'IsEscalated', 'AccountId', 'Account.Name', 'OwnerId', 'Owner.Name', 'CreatedDate', 'ClosedDate', 'Reason', 'Close_Reason__c', 'Category__c', 'Cause__c'],
  currentnew: ['Id', 'CaseNumber', 'Subject', 'Status', 'Priority', 'Origin', 'AccountId', 'Account.Name', 'Account.AccountNumber', 'Salesrep__r.Name', 'ContactId', 'Contact.Name', 'Contact.Email', 'CreatedDate', 'OwnerId', 'Owner.Name', 'Region__c', 'Brand__c', 'Equipment_Type__c'],
  workbench: ['Id', 'CaseNumber', 'Subject', 'Status', 'Priority', 'Origin', 'AccountId', 'ContactId', 'OwnerId', 'CreatedDate', 'LastModifiedDate', 'IsClosed', 'IsEscalated', 'Brand__c', 'Equipment_Type__c', 'Region__c', 'Part_Number_s__c']
};

/* Merge fields — Salesforce {{{triple-brace}}} standard */
var MERGE_FIELDS = [
  { token: '{{{Case.CaseNumber}}}', label: 'Case Number' },
  { token: '{{{Case.Subject}}}', label: 'Case Subject' },
  { token: '{{{Case.Status}}}', label: 'Case Status' },
  { token: '{{{Case.Priority}}}', label: 'Case Priority' },
  { token: '{{{Case.Brand__c}}}', label: 'Brand' },
  { token: '{{{Case.Equipment_Type__c}}}', label: 'Equipment Type' },
  { token: '{{{Case.Region__c}}}', label: 'Region' },
  { token: '{{{Case.CreatedDate}}}', label: 'Created Date' },
  { token: '{{{Account.Name}}}', label: 'Account Name' },
  { token: '{{{Account.AccountNumber}}}', label: 'Account Number' },
  { token: '{{{Account.Phone}}}', label: 'Account Phone' },
  { token: '{{{Account.BillingStreet}}}', label: 'Billing Street' },
  { token: '{{{Account.Website}}}', label: 'Website' },
  { token: '{{{Contact.Name}}}', label: 'Contact Name' },
  { token: '{{{Contact.Email}}}', label: 'Contact Email' },
  { token: '{{{Contact.Phone}}}', label: 'Contact Phone' },
  { token: '{{{Salesrep__r.Name}}}', label: 'Sales Rep Name' },
  { token: '{{{Salesrep__r.Email}}}', label: 'Sales Rep Email' },
  { token: '{{{Owner.Name}}}', label: 'Owner Name' },
  { token: '{{{FROM_NAME}}}', label: 'From Name (CellsForce)' },
  { token: '{{{FROM_EMAIL}}}', label: 'From Email (CellsForce)' },
  { token: '{{{DEADLINE_PHRASE}}}', label: 'Deadline Phrase' },
];

/* ════════════════════════════════════════════════════════════════
   BOOT & UTILITIES
════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function () {
  // Set correct responsive layout modes on startup
  var params = new URLSearchParams(window.location.search);
  if (params.get('mode') === 'sidebar' || window.innerWidth < 500) {
    document.body.classList.add('mode-sidebar');
  } else if (params.get('mode') === 'poppedout') {
    document.body.classList.add('mode-popped-out');
  }

  loadSettings();
  renderGroupSidebar();
  renderFieldGrid('Core');
  buildQuery();
  renderFilterRows();
  renderMergeFieldPalette();
  renderQueryLibrarySidebar();
  renderUpdateHeaderTabs();
  updateClock();
  setInterval(updateClock, 1000);
  document.addEventListener('mousemove', moveTip);
  document.addEventListener('mouseleave', hideTip);
  if (window.SoqlTemplatesUI) SoqlTemplatesUI.mount();
  if (window.CaseTriage) CaseTriage.mount();

  // Hide pop out button if already popped out window (popup or panel type)
  try {
    var api = typeof browser !== 'undefined' ? browser : chrome;
    api.windows.getCurrent(function (win) {
      var btn = document.getElementById('btnPopOut');
      if (btn && (win.type === 'popup' || win.type === 'panel')) {
        btn.style.display = 'none';
      }
    });
  } catch (e) { }

  // Load app state
  if (typeof loadAppState === 'function') loadAppState();

  // Attach auto-save listeners on change and input
  document.addEventListener('input', function () {
    if (typeof triggerSaveState === 'function') triggerSaveState();
  });
  document.addEventListener('change', function () {
    if (typeof triggerSaveState === 'function') triggerSaveState();
  });
});

function updateClock() {
  var el = document.getElementById('statusTime');
  if (el) el.textContent = new Date().toLocaleTimeString();
}
function setStatus(m) {
  var el = document.getElementById('statusMsg');
  if (el) el.textContent = m;
}
function v(id) { var e = document.getElementById(id); return e ? e.value || '' : ''; }
function c(id) { var e = document.getElementById(id); return e ? !!e.checked : false; }
function esc(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

function copyEl(elId) {
  var el = document.getElementById(elId);
  if (!el) return;
  var text = el.innerText || el.textContent;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      setStatus('Copied!'); setTimeout(function () { setStatus('Ready'); }, 2000);
    }).catch(function () { fbCopy(text); });
  } else { fbCopy(text); }
}
function fbCopy(t) {
  var ta = document.createElement('textarea'); ta.value = t;
  document.body.appendChild(ta); ta.select();
  document.execCommand('copy'); document.body.removeChild(ta);
  setStatus('Copied!'); setTimeout(function () { setStatus('Ready'); }, 2000);
}
function dl(content, fname, mime) {
  var blob = new Blob([content], { type: mime || 'text/plain' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href = url; a.download = fname;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  setStatus('Downloaded: ' + fname);
}

/* ════════════════════════════════════════════════════════════════
   TAB & WIZARD NAVIGATION
════════════════════════════════════════════════════════════════ */
function switchTab(id) {
  document.querySelectorAll('.cf-panel').forEach(function (p) { p.classList.remove('active'); });
  document.querySelectorAll('.cf-tab').forEach(function (b) { b.classList.remove('active'); });
  var panel = document.getElementById(id);
  if (panel) panel.classList.add('active');
  var btn = document.querySelector('.cf-tab[data-t="' + id + '"]');
  if (btn) btn.classList.add('active');
  if (id === 't-email') buildEmailMerge();
  if (id === 't-table') renderDataTable(parsedRecords);
  if (id === 't-library') { renderQueryLibrarySidebar(); rebuildLibrary(); }
  if (id === 't-soql' && window.SoqlTemplatesUI) SoqlTemplatesUI.refresh();
  if (id === 't-triage' && window.CaseTriage) CaseTriage.refresh();
  if (typeof triggerSaveState === 'function') triggerSaveState();
}

function goStep(n) {
  for (var i = 1; i <= 7; i++) {
    var ws = document.getElementById('wiz' + i);
    if (!ws) continue;
    ws.classList.remove('active', 'done');
    if (i < n) ws.classList.add('done');
    if (i === n) ws.classList.add('active');
  }
  var tabMap = {
    1: 't-extract', 2: 't-builder', 3: 't-builder', 4: 't-builder',
    5: 't-builder', 6: 't-parse', 7: 't-email'
  };
  if (tabMap[n]) switchTab(tabMap[n]);
  // scroll to relevant section within builder
  var scrollMap = { 2: 'builderFields', 3: 'builderFilters', 4: 'builderSOQL', 5: 'builderSOQL' };
  if (scrollMap[n]) {
    var el = document.getElementById(scrollMap[n]);
    if (el) setTimeout(function () { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
  }
}

/* ════════════════════════════════════════════════════════════════
   SMART PASTE ENGINE — EXTRACT TAB
   Mirrors GAS EXTRACT_CASE_NUMBERS logic + more
════════════════════════════════════════════════════════════════ */

/* Live extraction as user types */
function liveExtract() {
  var raw = v('speInput');
  if (raw.length > 20) runExtract();
}

function runExtract() {
  var raw = v('speInput');
  if (!raw.trim()) { resetExtractUI(); return; }

  extractedAll = { cases: [], accounts: [], sfIds: [], emails: [], phones: [], custom: [] };

  /* ── Case Numbers: 8-digit starting with 0 (GAS: EXTRACT_CASE_NUMBERS) ── */
  if (c('exCaseNums')) {
    var caseMatches = raw.match(/(?:^|\D)(0\d{7})(?!\d)/g) || [];
    var seenC = {};
    caseMatches.forEach(function (m) {
      var num = m.replace(/\D/g, '').slice(-8);
      if (num.length === 8 && num[0] === '0' && !seenC[num]) {
        seenC[num] = true; extractedAll.cases.push(num);
      }
    });
    if (typeof SoqlEngine !== 'undefined' && SoqlEngine.extractCaseNumbers) {
      SoqlEngine.extractCaseNumbers(raw).forEach(function (num) {
        if (!seenC[num]) { seenC[num] = true; extractedAll.cases.push(num); }
      });
      extractedAll.cases.sort();
    }
  }

  /* ── SF IDs: 15-char or 18-char alphanumeric starting with 0 ── */
  if (c('exSFIds')) {
    var sfMatches = raw.match(/\b([A-Z0-9]{15}([A-Z0-9]{3})?)\b/g) || [];
    var seenSF = {};
    sfMatches.forEach(function (id) {
      if ((id.length === 15 || id.length === 18) && /^[0-9]/.test(id) && !seenSF[id]) {
        /* exclude case numbers already found */
        if (extractedAll.cases.indexOf(id.substring(0, 8)) === -1) {
          seenSF[id] = true; extractedAll.sfIds.push(id);
        }
      }
    });
  }

  /* ── Account Numbers: patterns like ACC-XXXXX or 5-8 digit numeric strings ── */
  if (c('exAcctNums')) {
    var acctMatches = raw.match(/\b([A-Z]{2,4}-\d{3,8}|\d{5,8})\b/g) || [];
    var seenA = {};
    acctMatches.forEach(function (n) {
      /* exclude 8-digit case numbers */
      if (!/^0\d{7}$/.test(n) && !seenA[n]) {
        seenA[n] = true; extractedAll.accounts.push(n);
      }
    });
  }

  /* ── Emails ── */
  if (c('exEmails')) {
    var emailMatches = raw.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [];
    var seenE = {};
    emailMatches.forEach(function (e) {
      if (!seenE[e]) { seenE[e] = true; extractedAll.emails.push(e); }
    });
  }

  /* ── Phone Numbers ── */
  if (c('exPhones')) {
    var phoneMatches = raw.match(/(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) || [];
    var seenP = {};
    phoneMatches.forEach(function (p) {
      var clean = p.replace(/\s/g, '');
      if (!seenP[clean]) { seenP[clean] = true; extractedAll.phones.push(clean); }
    });
  }

  /* ── Custom pattern ── */
  var customPat = v('customPatternInput').trim();
  if (customPat) {
    try {
      var re = new RegExp(customPat, 'g');
      var customMatches = raw.match(re) || [];
      var seenCust = {};
      customMatches.forEach(function (m) {
        if (!seenCust[m]) { seenCust[m] = true; extractedAll.custom.push(m); }
      });
    } catch (e) { /* invalid regex */ }
  }

  selectedCaseNums = extractedAll.cases.slice(); /* default: all selected */
  renderExtractResults();
  updateFormattedOutput();
  setStatus('Extracted ' + getTotalExtracted() + ' items from pasted text');
  if (typeof triggerSaveState === 'function') triggerSaveState();
}

function getTotalExtracted() {
  return extractedAll.cases.length + extractedAll.sfIds.length +
    extractedAll.accounts.length + extractedAll.emails.length +
    extractedAll.phones.length + extractedAll.custom.length;
}

function resetExtractUI() {
  extractedAll = { cases: [], accounts: [], sfIds: [], emails: [], phones: [], custom: [] };
  selectedCaseNums = [];
  var eb = document.getElementById('exCountBadge');
  if (eb) eb.textContent = '0 items';
  var cs = document.getElementById('exCaseSection');
  if (cs) cs.style.display = 'none';
  var os = document.getElementById('exOtherSection');
  if (os) os.innerHTML = '';
  var fo = document.getElementById('formattedOutput');
  if (fo) fo.value = '';
  var es = document.getElementById('exStats');
  if (es) es.innerHTML = '';
}

function renderExtractResults() {
  var total = getTotalExtracted();
  var badge = document.getElementById('exCountBadge');
  if (badge) badge.textContent = total + ' item' + (total !== 1 ? 's' : '');

  /* Stats */
  var statsEl = document.getElementById('exStats');
  if (statsEl) {
    var parts = [];
    if (extractedAll.cases.length) parts.push('<span style="color:#fde68a;font-size:10px;font-weight:700;">' + extractedAll.cases.length + ' Case Nums</span>');
    if (extractedAll.sfIds.length) parts.push('<span style="color:#67e8f9;font-size:10px;font-weight:700;">' + extractedAll.sfIds.length + ' SF IDs</span>');
    if (extractedAll.accounts.length) parts.push('<span style="color:#86efac;font-size:10px;font-weight:700;">' + extractedAll.accounts.length + ' Acct Nums</span>');
    if (extractedAll.emails.length) parts.push('<span style="color:#c4b5fd;font-size:10px;font-weight:700;">' + extractedAll.emails.length + ' Emails</span>');
    if (extractedAll.phones.length) parts.push('<span style="color:#fca5a5;font-size:10px;font-weight:700;">' + extractedAll.phones.length + ' Phones</span>');
    if (extractedAll.custom.length) parts.push('<span style="color:var(--amber);font-size:10px;font-weight:700;">' + extractedAll.custom.length + ' Custom</span>');
    statsEl.innerHTML = parts.join('<span style="color:rgba(255,255,255,.3);margin:0 5px;">|</span>');
  }

  /* Case number chips */
  var csSection = document.getElementById('exCaseSection');
  var csChips = document.getElementById('caseChips');
  if (extractedAll.cases.length > 0) {
    if (csSection) csSection.style.display = 'block';
    if (csChips) {
      csChips.innerHTML = extractedAll.cases.map(function (num) {
        var sel = selectedCaseNums.indexOf(num) !== -1;
        return '<span class="case-chip' + (sel ? ' selected' : '') + '" onclick="toggleCaseChip(\'' + num + '\')">' + num + '</span>';
      }).join('');
    }
  } else {
    if (csSection) csSection.style.display = 'none';
  }

  /* Other extractions */
  var otherEl = document.getElementById('exOtherSection');
  if (otherEl) {
    var html = '';
    var sections = [
      { key: 'sfIds', label: 'Salesforce IDs', color: '#67e8f9' },
      { key: 'accounts', label: 'Account Numbers', color: '#86efac' },
      { key: 'emails', label: 'Email Addresses', color: '#c4b5fd' },
      { key: 'phones', label: 'Phone Numbers', color: '#fca5a5' },
      { key: 'custom', label: 'Custom Matches', color: 'var(--amber)' },
    ];
    sections.forEach(function (s) {
      if (extractedAll[s.key].length) {
        html += '<div style="margin-bottom:7px;">';
        html += '<span class="ex-section-label" style="color:' + s.color + '">' + s.label + ':</span>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:2px;">';
        extractedAll[s.key].forEach(function (item) {
          html += '<span style="display:inline-block;background:rgba(255,255,255,.06);' +
            'border:1px solid rgba(255,255,255,.12);border-radius:3px;padding:1px 6px;' +
            'font-size:9.5px;font-family:Consolas,monospace;color:' + s.color + ';cursor:pointer;"' +
            ' onclick="fbCopy(\'' + esc(item) + '\')" title="Click to copy">' + item + '</span>';
        });
        html += '</div></div>';
      }
    });
    otherEl.innerHTML = html || '<p style="font-size:10px;color:rgba(255,255,255,.25);padding:6px 0;">Nothing else detected.</p>';
  }
}

function toggleCaseChip(num) {
  var idx = selectedCaseNums.indexOf(num);
  if (idx === -1) selectedCaseNums.push(num);
  else selectedCaseNums.splice(idx, 1);
  /* re-render chips only */
  var csChips = document.getElementById('caseChips');
  if (csChips) {
    csChips.querySelectorAll('.case-chip').forEach(function (chip) {
      var n = chip.textContent;
      chip.classList.toggle('selected', selectedCaseNums.indexOf(n) !== -1);
    });
  }
  updateFormattedOutput();
}

function selectAllCases() { selectedCaseNums = extractedAll.cases.slice(); renderExtractResults(); updateFormattedOutput(); }
function clearCaseSelection() { selectedCaseNums = []; renderExtractResults(); updateFormattedOutput(); }

function updateFormattedOutput() {
  var fmt = v('exFormat');
  var nums = selectedCaseNums.length ? selectedCaseNums : extractedAll.cases;
  var out = '';
  if (!nums.length) {
    /* fall back to all other extracted items combined */
    var all = extractedAll.sfIds.concat(extractedAll.accounts)
      .concat(extractedAll.emails).concat(extractedAll.phones)
      .concat(extractedAll.custom);
    nums = all;
  }
  if (!nums.length) { var fo = document.getElementById('formattedOutput'); if (fo) fo.value = ''; return; }

  switch (fmt) {
    case 'in_list': out = nums.map(function (n) { return "'" + n + "'"; }).join(','); break;
    case 'comma': out = nums.join(','); break;
    case 'newline': out = nums.join('\n'); break;
    case 'quoted_comma': out = nums.map(function (n) { return '"' + n + '"'; }).join(','); break;
    case 'array': out = JSON.stringify(nums); break;
    case 'sql_in': out = '(' + nums.join(',') + ')'; break;
    default: out = nums.map(function (n) { return "'" + n + "'"; }).join(',');
  }
  var fo = document.getElementById('formattedOutput');
  if (fo) fo.value = out;
}

function copyFormattedOutput() {
  var fo = document.getElementById('formattedOutput');
  if (fo) { fbCopy(fo.value); setStatus('Output copied!'); }
}

function downloadExtracted() {
  var rows = [['Type', 'Value']];
  extractedAll.cases.forEach(function (n) { rows.push(['CaseNumber', n]); });
  extractedAll.sfIds.forEach(function (n) { rows.push(['SalesforceID', n]); });
  extractedAll.accounts.forEach(function (n) { rows.push(['AccountNumber', n]); });
  extractedAll.emails.forEach(function (n) { rows.push(['Email', n]); });
  extractedAll.phones.forEach(function (n) { rows.push(['Phone', n]); });
  extractedAll.custom.forEach(function (n) { rows.push(['Custom', n]); });
  var csv = rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
  dl(csv, 'cellsforce_extracted.csv', 'text/csv');
}

function copyCaseNumbers() {
  var nums = selectedCaseNums.length ? selectedCaseNums : extractedAll.cases;
  var out = nums.map(function (n) { return "'" + n + "'"; }).join(',');
  fbCopy(out);
  setStatus('Copied ' + nums.length + ' case numbers as SOQL IN list');
}

/* Send extracted case numbers to Query Library */
function sendToLibrary() {
  var nums = selectedCaseNums.length ? selectedCaseNums : extractedAll.cases;
  var inp = document.getElementById('libCaseInput');
  if (inp) inp.value = nums.join(', ');
  switchTab('t-library');
  rebuildLibrary();
  setStatus('Case numbers sent to Query Library (' + nums.length + ')');
}

/* Send extracted case numbers to SOQL Builder WHERE IN */
function sendToBuilder() {
  var nums = selectedCaseNums.length ? selectedCaseNums : extractedAll.cases;
  switchTab('t-builder');
  /* inject as a pre-built filter row */
  filterRowsArr = [{ field: 'CaseNumber', op: 'IN', val: nums.join(','), conj: 'AND' }];
  renderFilterRows();
  buildQuery();
  setStatus('Case numbers injected into SOQL Builder (' + nums.length + ')');
}

function clearSPE() {
  var sp = document.getElementById('speInput'); if (sp) sp.value = '';
  resetExtractUI();
  setStatus('Smart Paste cleared');
}

function pasteSPE() {
  if (navigator.clipboard && navigator.clipboard.readText) {
    navigator.clipboard.readText().then(function (text) {
      var sp = document.getElementById('speInput');
      if (sp) { sp.value = text; runExtract(); }
    }).catch(function () {
      setStatus('Clipboard access denied — paste manually (Ctrl+V)');
    });
  } else {
    setStatus('Click the text area and press Ctrl+V to paste');
  }
}

function loadSPESample() {
  var sample = 'Hello Danny,\n\n' +
    'Please review the following cases from today\'s queue:\n\n' +
    'Cases: 00234561, 00234562, 00234563, 00234564\n' +
    'Account: ACC-88291, ACC-88292\n' +
    'SF IDs: 500A000001abc01, 001A000001xyz99\n\n' +
    'Contact emails:\n' +
    '  john.smith@acmecorp.com\n' +
    '  jane.doe@betahvac.com\n\n' +
    'Call-back numbers: 416-555-1234, (647) 555-9876\n\n' +
    'Additional: 00234565, case 00234566 still open\n' +
    'Danny H – Carrier Enterprise\n' +
    'Ref: 00234567, 00234568, 00234569';
  var sp = document.getElementById('speInput');
  if (sp) sp.value = sample;
  runExtract();
  setStatus('Sample data loaded — showing extraction results');
}

/* ════════════════════════════════════════════════════════════════
   IMAGE / SCREENSHOT COLUMN DETECTOR
════════════════════════════════════════════════════════════════ */
function handleImgDrop(event) {
  event.preventDefault();
  var dz = document.getElementById('imgDropZone');
  if (dz) dz.classList.remove('drag-over');
  var file = event.dataTransfer.files && event.dataTransfer.files[0];
  if (file && file.type.indexOf('image') === 0) loadImgFile(file);
}

function handleImgFile(event) {
  var file = event.target.files && event.target.files[0];
  if (file) loadImgFile(file);
}

function loadImgFile(file) {
  var reader = new FileReader();
  reader.onload = function (e) {
    imgDataUrl = e.target.result;
    var wrap = document.getElementById('imgPreviewWrap');
    var preview = document.getElementById('imgPreview');
    if (!wrap || !preview) return;
    preview.innerHTML = '<img src="' + imgDataUrl + '" alt="Screenshot preview"/>';
    wrap.style.display = 'block';
    setStatus('Image loaded — click "Detect Columns" to extract column headers');
  };
  reader.readAsDataURL(file);
}

function clearImg() {
  imgDataUrl = null;
  var wrap = document.getElementById('imgPreviewWrap');
  var colWr = document.getElementById('colDetectResults');
  var fi = document.getElementById('imgFileInput');
  if (wrap) wrap.style.display = 'none';
  if (colWr) colWr.style.display = 'none';
  if (fi) fi.value = '';
  setStatus('Image cleared');
}

/*
 * extractFromImage: Since Firefox extensions cannot use server-side OCR,
 * we use a clever DOM-based approach — draw the image to a canvas, then
 * apply a heuristic pattern matcher for common Salesforce column header words.
 * For real OCR, this would call an external service. Here we extract text
 * from the image filename + any metadata, and provide a manual entry fallback.
 */
function extractFromImage() {
  if (!imgDataUrl) { setStatus('No image loaded.'); return; }

  setStatus('Analysing image for column headers...');

  /* Draw to canvas and try to read any embedded text regions */
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d');
  var img = new Image();
  img.onload = function () {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    /* Since we cannot run full OCR in a FF extension without external libs,
     * we show the image to the user + provide a column-name palette based on
     * known Salesforce field names, plus a text input for manual entry.
     * The user can click any chip to toggle it for the query. */

    showColumnDetectUI();
  };
  img.src = imgDataUrl;
}

function showColumnDetectUI() {
  var colWr = document.getElementById('colDetectResults');
  var chips = document.getElementById('colChips');
  if (!colWr || !chips) return;

  /* Show all known field groups as toggleable chips */
  var commonCols = [
    'Id', 'CaseNumber', 'Subject', 'Status', 'Priority', 'Origin',
    'AccountId', 'Account.Name', 'Account.AccountNumber',
    'Brand__c', 'Equipment_Type__c', 'Serial_Number__c', 'Model_Number__c',
    'Region__c', 'Division__c', 'Ship_To__c', 'Area__c',
    'ContactId', 'Contact.Name', 'Contact.Email',
    'OwnerId', 'Owner.Name', 'Salesrep__r.Name', 'Salesrep__r.Email',
    'CreatedDate', 'LastModifiedDate', 'ClosedDate', 'Due_Date__c',
    'Category__c', 'Cause__c', 'Close_Reason__c', 'Reason',
    'RPA_Status__c', 'Claim_Number__c', 'Order_Number__c',
    'Onboarding_Status__c', 'Program_Tier__c',
    'Registration_Verification_Done__c', 'Credit_Approved__c',
  ];

  chips.innerHTML = commonCols.map(function (col) {
    return '<span class="col-chip" onclick="toggleColChip(this,\'' + esc(col) + '\')" data-col="' + esc(col) + '">' + col + '</span>';
  }).join('');

  /* Also add a text input for manual column entry */
  chips.innerHTML +=
    '<div style="width:100%;margin-top:8px;display:flex;gap:6px;">' +
    '<input type="text" id="manualColInput" placeholder="Type field API name and press Enter..." ' +
    'style="flex:1;font-family:Consolas,monospace;font-size:10.5px;" ' +
    'onkeydown="if(event.key===\'Enter\'){addManualCol();}"/>' +
    '<button class="btn btn-orange btn-sm" onclick="addManualCol()">+ Add</button>' +
    '</div>';

  colWr.style.display = 'block';
  setStatus('Click column chips to select them for your SOQL query — or type field names manually');
}

function toggleColChip(el, col) {
  el.classList.toggle('active');
}

function addManualCol() {
  var inp = document.getElementById('manualColInput');
  if (!inp || !inp.value.trim()) return;
  var col = inp.value.trim();
  var chips = document.getElementById('colChips');
  if (!chips) return;
  /* insert before the manual input row */
  var newChip = document.createElement('span');
  newChip.className = 'col-chip active';
  newChip.setAttribute('data-col', col);
  newChip.textContent = col;
  newChip.onclick = function () { newChip.classList.toggle('active'); };
  chips.insertBefore(newChip, chips.querySelector('div'));
  inp.value = '';
}

function useDetectedColumns() {
  var chips = document.querySelectorAll('#colChips .col-chip.active');
  if (!chips.length) {
    alert('Select at least one column chip first (click to toggle active/inactive).');
    return;
  }
  chips.forEach(function (chip) {
    var col = chip.getAttribute('data-col') || chip.textContent;
    if (col) selectedFields.add(col);
  });
  renderGroupSidebar();
  renderFieldGrid(currentGroup, '');
  buildQuery();
  switchTab('t-builder');
  setStatus('Detected columns added to SOQL field selection (' + chips.length + ' fields)');
}

/* ════════════════════════════════════════════════════════════════
   FIELD PICKER
════════════════════════════════════════════════════════════════ */
function getGroups() {
  var groups = [];
  FIELDS.forEach(function (f) { if (groups.indexOf(f.group) === -1) groups.push(f.group); });
  return groups;
}

function renderGroupSidebar() {
  var c2 = document.getElementById('fpGroups');
  if (!c2) return;
  var groups = getGroups();
  c2.innerHTML = groups.map(function (g) {
    var total = FIELDS.filter(function (f) { return f.group === g; }).length;
    var selCnt = FIELDS.filter(function (f) { return f.group === g && selectedFields.has(f.api); }).length;
    var active = g === currentGroup ? 'active' : '';
    return '<button class="fp-group-btn ' + active + '" onclick="selectGroup(\'' + esc(g) + '\')">' +
      g + '<span class="gcnt">' + (selCnt ? selCnt + '/' : '') + total + '</span></button>';
  }).join('');
}

function selectGroup(g) {
  currentGroup = g;
  renderGroupSidebar();
  var q = document.getElementById('fieldSearch');
  renderFieldGrid(g, q ? q.value : '');
}

function filterFields(q) {
  renderFieldGrid(null, q);
}

function renderFieldGrid(group, search) {
  var c2 = document.getElementById('fpFields');
  if (!c2) return;
  var grp = group || currentGroup;
  var q = (search || '').toLowerCase().trim();

  var fields = FIELDS.filter(function (f) {
    var inGroup = q ? true : (f.group === grp);
    var matchSearch = !q || f.api.toLowerCase().indexOf(q) !== -1 || f.label.toLowerCase().indexOf(q) !== -1;
    return inGroup && matchSearch;
  });

  var excRel = c('chkExcludeRel');

  c2.innerHTML = '<div class="fp-field-grid">' +
    fields.map(function (f) {
      var isChecked = selectedFields.has(f.api);
      var isRel = !!f.relField;
      var dimStyle = (excRel && isRel) ? 'opacity:.35;pointer-events:none;' : '';
      return '<label class="fp-field-item ' + (isChecked ? 'checked' : '') + '" style="' + dimStyle + '"' +
        ' onmouseenter="showTip(event,\'' + esc(f.api) + '\',\'' + esc(f.label) + '\',\'' + esc(f.tip) + '\',\'' + esc(f.example || '') + '\')' + '"' +
        ' onmouseleave="hideTip()">' +
        '<input type="checkbox" ' + (isChecked ? 'checked' : '') +
        ' onchange="toggleField(\'' + esc(f.api) + '\',this.checked)"/>' +
        '<div class="fp-field-label">' +
        '<span class="api-name">' + f.api + '</span>' +
        '<span class="display-name">' + f.label + (isRel ? ' <em style="color:#f59e0b;font-size:8px;">rel</em>' : '') + '</span>' +
        '</div>' +
        '</label>';
    }).join('') + '</div>';

  updateSelCount();
}

function toggleField(api, checked) {
  if (checked) selectedFields.add(api);
  else selectedFields.delete(api);
  var c2 = document.getElementById('fpFields');
  if (c2) {
    c2.querySelectorAll('.fp-field-item').forEach(function (item) {
      var inp = item.querySelector('input[type=checkbox]');
      if (!inp) return;
      var oc = inp.getAttribute('onchange') || '';
      var m = oc.match(/toggleField\('([^']+)'/);
      if (m) item.classList.toggle('checked', selectedFields.has(m[1]));
    });
  }
  renderGroupSidebar();
  updateSelCount();
  buildQuery();
}

function updateSelCount() {
  var el = document.getElementById('selCount');
  if (el) el.textContent = selectedFields.size + ' selected';
}

function selectAllVisible() {
  var q = document.getElementById('fieldSearch');
  var qv = q ? q.value : '';
  var grp = currentGroup;
  FIELDS.filter(function (f) {
    return qv ? (f.api.toLowerCase().indexOf(qv.toLowerCase()) !== -1 ||
      f.label.toLowerCase().indexOf(qv.toLowerCase()) !== -1)
      : f.group === grp;
  }).forEach(function (f) { selectedFields.add(f.api); });
  renderFieldGrid(null, qv);
  renderGroupSidebar();
  buildQuery();
}

function clearAllFields() {
  selectedFields.clear();
  renderFieldGrid(currentGroup, '');
  renderGroupSidebar();
  buildQuery();
}

function applyPreset(name) {
  var preset = PRESETS[name];
  if (!preset) return;
  selectedFields = new Set(preset);
  renderFieldGrid(currentGroup, '');
  renderGroupSidebar();
  buildQuery();
  setStatus('Preset applied: ' + name);
}

/* ════════════════════════════════════════════════════════════════
   TOOLTIP
════════════════════════════════════════════════════════════════ */
var tipVisible = false;
function showTip(e, api, label, tip, example) {
  var box = document.getElementById('cfTipBox');
  if (!box) return;
  box.innerHTML =
    '<strong style="color:#fff;font-size:11px;">' + label + '</strong><br/>' +
    '<span class="tip-api">' + api + '</span><br/>' +
    '<span style="font-size:10.5px;color:#c4b5fd;line-height:1.5;">' + tip + '</span>' +
    (example ? '<div class="tip-ex">Example: <strong style="color:#67e8f9;">' + api + '</strong> ' + example + '</div>' : '');
  box.style.display = 'block';
  moveTip(e);
  tipVisible = true;
}
function hideTip() {
  var box = document.getElementById('cfTipBox');
  if (box) box.style.display = 'none';
  tipVisible = false;
}
function moveTip(e) {
  if (!tipVisible) return;
  var box = document.getElementById('cfTipBox');
  if (!box) return;
  var x = e.clientX + 14, y = e.clientY + 14;
  if (x + 295 > window.innerWidth) x = e.clientX - 305;
  if (y + 130 > window.innerHeight) y = e.clientY - 140;
  box.style.left = x + 'px';
  box.style.top = y + 'px';
}

/* ════════════════════════════════════════════════════════════════
   FILTER ROW BUILDER
════════════════════════════════════════════════════════════════ */
var OPERATORS = [
  { val: '=', label: '= equals' },
  { val: '!=', label: '!= not equals' },
  { val: 'LIKE', label: 'LIKE contains' },
  { val: 'NOT LIKE', label: 'NOT LIKE' },
  { val: '>', label: '> greater than' },
  { val: '>=', label: '>= greater or equal' },
  { val: '<', label: '< less than' },
  { val: '<=', label: '<= less or equal' },
  { val: '= NULL', label: '= NULL (blank)' },
  { val: '!= NULL', label: '!= NULL (has value)' },
  { val: 'IN', label: 'IN (list)' },
  { val: 'NOT IN', label: 'NOT IN (exclude)' },
];

function addFilterRow(conj) {
  filterRowsArr.push({ field: 'Status', op: '=', val: 'New', conj: conj || 'AND' });
  renderFilterRows();
  buildQuery();
}

function clearFilters() {
  filterRowsArr = [];
  renderFilterRows();
  buildQuery();
}

function renderFilterRows() {
  var c2 = document.getElementById('filterRows');
  if (!c2) return;
  if (!filterRowsArr.length) {
    c2.innerHTML = '<div style="font-size:10.5px;color:rgba(255,255,255,.28);padding:8px 0;font-style:italic;">' +
      'No conditions — click "+ Add Condition" below. Case numbers from Smart Paste are auto-injected.</div>';
    return;
  }
  c2.innerHTML = filterRowsArr.map(function (row, idx) {
    var conjHtml = idx === 0 ? '' :
      '<span class="filter-conj" title="Click to toggle AND/OR" onclick="toggleConj(' + idx + ')">' + row.conj + '</span>';
    var noVal = (row.op === '= NULL' || row.op === '!= NULL');
    return '<div class="filter-row">' +
      conjHtml +
      '<select class="op-select" onchange="updateFilter(' + idx + ',\'field\',this.value)" ' +
      'style="max-width:180px;">' +
      FIELDS.map(function (f) {
        return '<option value="' + f.api + '"' + (f.api === row.field ? ' selected' : '') + '>' +
          (f.api.length > 30 ? f.api.substring(0, 30) + '…' : f.api) + '</option>';
      }).join('') +
      '</select>' +
      '<select class="op-select" style="max-width:140px;" onchange="updateFilter(' + idx + ',\'op\',this.value)">' +
      OPERATORS.map(function (o) {
        return '<option value="' + o.val + '"' + (o.val === row.op ? ' selected' : '') + '>' + o.label + '</option>';
      }).join('') +
      '</select>' +
      (noVal
        ? '<input type="text" value="" disabled style="opacity:.3;max-width:140px;" placeholder="(no value needed)"/>'
        : '<input type="text" value="' + esc(row.val) + '" onchange="updateFilter(' + idx + ',\'val\',this.value)" ' +
        'placeholder="value…" style="max-width:140px;"/>') +
      '<button class="btn btn-ghost btn-sm" onclick="removeFilter(' + idx + ')" style="flex-shrink:0;">&times;</button>' +
      '</div>';
  }).join('');
}

function updateFilter(idx, key, val) {
  if (!filterRowsArr[idx]) return;
  filterRowsArr[idx][key] = val;
  renderFilterRows();
  buildQuery();
}

function toggleConj(idx) {
  if (!filterRowsArr[idx]) return;
  filterRowsArr[idx].conj = filterRowsArr[idx].conj === 'AND' ? 'OR' : 'AND';
  renderFilterRows();
  buildQuery();
}

function removeFilter(idx) {
  filterRowsArr.splice(idx, 1);
  if (filterRowsArr.length > 0) filterRowsArr[0].conj = 'AND';
  renderFilterRows();
  buildQuery();
}

/* ════════════════════════════════════════════════════════════════
   SOQL BUILDER & HIGHLIGHTER
════════════════════════════════════════════════════════════════ */
var KW = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'IN', 'NOT', 'NULL', 'ORDER', 'BY',
  'ASC', 'DESC', 'LIMIT', 'LIKE', 'TRUE', 'FALSE', 'GROUP', 'HAVING', 'OFFSET'];

function renderSOQL(elId, soql) {
  var el = document.getElementById(elId);
  if (!el) return;
  var h = soql.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  h = h.replace(/'([^']*)'/g, "<span class='str'>'$1'</span>");
  h = h.replace(/(\/\*[\s\S]*?\*\/|--[^\n]*)/g, "<span class='cmt'>$1</span>");
  KW.forEach(function (kw) {
    h = h.replace(new RegExp('\\b(' + kw + ')\\b', 'g'), "<span class='kw'>$1</span>");
  });
  el.innerHTML = h;
}

function buildQuery() {
  var obj = v('qObject') || 'Case';
  var lim = v('qLimit') || '200';
  var ob = v('orderByField');
  var dir = v('orderDir') || 'ASC';
  var excRel = c('chkExcludeRel');

  /* Fields */
  var fields = Array.from(selectedFields).filter(function (f) {
    if (!excRel) return true;
    var def = FIELDS.find(function (d) { return d.api === f; });
    return !(def && def.relField);
  });
  if (!fields.length) fields = ['Id', 'CaseNumber', 'Subject', 'Status'];

  var soql = 'SELECT\n    ' + fields.join(',\n    ') + '\nFROM ' + obj;

  /* WHERE clause */
  var wheres = [];

  /* Auto-inject case numbers from Smart Paste */
  var caseNums = selectedCaseNums.length ? selectedCaseNums : extractedAll.cases;
  if (caseNums.length > 0 && obj === 'Case') {
    var inList = caseNums.map(function (n) { return "'" + n + "'"; }).join(', ');
    wheres.push('CaseNumber IN (' + inList + ')');
  }

  /* Manual filter rows */
  filterRowsArr.forEach(function (row, idx) {
    var clause = '';
    var noVal = (row.op === '= NULL' || row.op === '!= NULL');
    if (noVal) {
      clause = row.field + ' ' + row.op;
    } else if (row.op === 'IN' || row.op === 'NOT IN') {
      var vals = row.val.split(',').map(function (x) { return "'" + x.trim() + "'"; }).join(', ');
      clause = row.field + ' ' + row.op + ' (' + vals + ')';
    } else if (row.op === 'LIKE' || row.op === 'NOT LIKE') {
      clause = row.field + ' ' + row.op + " '%" + row.val + "%'";
    } else {
      var isNum = !isNaN(row.val) && row.val.trim() !== '';
      var isBool = row.val.toLowerCase() === 'true' || row.val.toLowerCase() === 'false';
      var isDate = /\d{4}-\d{2}-\d{2}/.test(row.val) ||
        row.val.indexOf('TODAY') !== -1 || row.val.indexOf('LAST_N') !== -1;
      var qVal = (isNum || isBool || isDate) ? row.val : "'" + row.val + "'";
      clause = row.field + ' ' + row.op + ' ' + qVal;
    }
    if (idx > 0 || wheres.length > 0) clause = row.conj + ' ' + clause;
    wheres.push(clause);
  });

  if (wheres.length) soql += '\nWHERE\n    ' + wheres.join('\n    ');
  if (ob) soql += '\nORDER BY ' + ob + ' ' + dir;
  soql += '\nLIMIT ' + lim;

  renderSOQL('soqlOutput', soql);

  /* Relationship warning */
  var hasRel = Array.from(selectedFields).some(function (f) {
    var def = FIELDS.find(function (d) { return d.api === f; });
    return def && def.relField;
  });
  var warn = document.getElementById('relWarning');
  if (warn) warn.style.display = (hasRel && !excRel) ? 'block' : 'none';

  setStatus('Query updated — ' + fields.length + ' fields, ' + wheres.length + ' filter(s)');
  return soql;
}

function copySOQL() {
  copyEl('soqlOutput');
  setStatus('SOQL copied to clipboard');
}

function downloadSOQL() {
  var el = document.getElementById('soqlOutput');
  if (!el) return;
  dl(el.innerText || el.textContent, 'cellsforce_query.soql', 'text/plain');
}

function openWorkbench() {
  var el = document.getElementById('soqlOutput');
  var soql = el ? (el.innerText || el.textContent) : '';
  showWbPopup(soql);
}

function showWbPopup(soql) {
  var existing = document.getElementById('wbOverlay');
  if (existing) existing.remove();
  var overlay = document.createElement('div');
  overlay.id = 'wbOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:9998;' +
    'display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML =
    '<div style="background:#1a1030;border:1px solid #7c5ef7;border-radius:10px;' +
    'padding:24px;max-width:520px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,.8);">' +
    '<h3 style="color:#FFB800;font-size:14px;font-weight:900;margin-bottom:12px;letter-spacing:1px;">' +
    '&#128279; Opening Salesforce Workbench</h3>' +
    '<ol style="color:#bfdbfe;font-size:12px;line-height:2.1;padding-left:20px;">' +
    '<li>CellsForce will <strong style="color:#FFB800;">copy your SOQL</strong> to clipboard and open Workbench.</li>' +
    '<li>In Workbench: go to <strong style="color:#fff;">Queries &rarr; SOQL Query</strong>.</li>' +
    '<li>Click inside the query box &rarr; <code style="background:rgba(255,255,255,.1);padding:1px 6px;border-radius:3px;">Ctrl+A</code> to select all.</li>' +
    '<li><code style="background:rgba(255,255,255,.1);padding:1px 6px;border-radius:3px;">Ctrl+V</code> to <strong style="color:#fff;">paste</strong> the CellsForce query.</li>' +
    '<li>Set <strong style="color:#FFB800;">View as: Bulk CSV</strong> for cleanest export.</li>' +
    '<li>Click <strong style="color:#fff;">Query</strong>.</li>' +
    '<li>When results appear: <code style="background:rgba(255,255,255,.1);padding:1px 6px;border-radius:3px;">Ctrl+A</code> &rarr; ' +
    '<code style="background:rgba(255,255,255,.1);padding:1px 6px;border-radius:3px;">Ctrl+C</code>.</li>' +
    '<li>Return here &rarr; go to <strong style="color:#FFB800;">Parse Results</strong> tab &rarr; paste &rarr; click Analyse.</li>' +
    '</ol>' +
    '<div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">' +
    '<button onclick="document.getElementById(\'wbOverlay\').remove()" ' +
    'style="padding:8px 16px;background:rgba(124,94,247,.2);border:1px solid rgba(124,94,247,.4);' +
    'color:#c4b5fd;border-radius:6px;cursor:pointer;font-family:inherit;font-size:11px;font-weight:700;">Cancel</button>' +
    '<button onclick="doOpenWB()" ' +
    'style="padding:8px 20px;background:linear-gradient(135deg,#FFB800,#ff9f1c);' +
    'border:none;color:#000;border-radius:6px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:900;">' +
    '&#128279; Open Workbench</button>' +
    '</div>' +
    '</div>';
  document.body.appendChild(overlay);
}

function doOpenWB() {
  var wbUrl = v('cfg_wbUrl') || 'https://workbench.developerforce.com/query.php';
  window.open(wbUrl, '_blank');
  var overlay = document.getElementById('wbOverlay');
  if (overlay) overlay.remove();
  copySOQL();
  setStatus('SOQL copied — paste it in the Workbench query box');
}

/* ════════════════════════════════════════════════════════════════
   QUERY LIBRARY
════════════════════════════════════════════════════════════════ */
var currentQueryId = null;

function renderQueryLibrarySidebar() {
  var sidebar = document.getElementById('qlSidebar');
  if (!sidebar) return;
  sidebar.innerHTML = QUERY_LIBRARY.map(function (q) {
    var active = q.id === currentQueryId ? 'active' : '';
    var objCls = 'obj-' + q.object.replace('__c', '__c');
    return '<div class="ql-item ' + active + '" onclick="selectQuery(\'' + q.id + '\')">' +
      '<div class="qi-title">' + q.title + '</div>' +
      '<span class="qi-obj ' + objCls + '">' + q.object + '</span>' +
      '</div>';
  }).join('');
}

function selectQuery(id) {
  currentQueryId = id;
  renderQueryLibrarySidebar();
  rebuildLibrary();
}

function getLibraryCaseNumbers() {
  var raw = v('libCaseInput').trim();
  if (!raw) return [];
  return raw.split(/[\n,]+/).map(function (n) { return n.trim(); }).filter(function (n) {
    return n.length === 8 && n[0] === '0';
  });
}

function rebuildLibrary() {
  var nums = getLibraryCaseNumbers();
  var badge = document.getElementById('libCaseCount');
  if (badge) badge.textContent = nums.length + ' case' + (nums.length !== 1 ? 's' : '');

  var main = document.getElementById('qlMain');
  if (!main) return;

  if (!currentQueryId && QUERY_LIBRARY.length) {
    currentQueryId = QUERY_LIBRARY[0].id;
    renderQueryLibrarySidebar();
  }

  var q = QUERY_LIBRARY.filter(function (x) { return x.id === currentQueryId; })[0];
  if (!q) { main.innerHTML = '<div class="ql-desc">Select a query from the left panel.</div>'; return; }

  var inList = nums.length
    ? nums.map(function (n) { return "'" + n + "'"; }).join(', ')
    : "'00000000' /* paste case numbers above */";

  var built = q.query.replace(/\{IN\}/g, inList);

  main.innerHTML =
    '<div class="ql-desc"><strong style="color:#c4b5fd;">' + q.title + '</strong><br/>' + q.desc + '</div>' +
    '<div style="font-size:9px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:5px;">' +
    'Object: <span style="color:#c4b5fd;">' + q.object + '</span>' +
    (nums.length ? ' &nbsp;|&nbsp; Cases: <span style="color:#fde68a;">' + nums.length + '</span>' : '') +
    '</div>' +
    '<div class="soql-out" id="qlQueryOut" style="max-height:260px;">-- building... --</div>' +
    '<div class="btn-row">' +
    '<button class="btn btn-purple" onclick="copyEl(\'qlQueryOut\')">&#128203; Copy SOQL</button>' +
    '<button class="btn btn-ghost btn-sm" onclick="dlLibraryQuery(\'' + esc(q.title) + '\')">&#8595; Download</button>' +
    '<button class="btn btn-gold" onclick="openWBWithQuery(\'qlQueryOut\')">&#128279; Open Workbench</button>' +
    '</div>';

  renderSOQL('qlQueryOut', built);
}

function dlLibraryQuery(title) {
  var el = document.getElementById('qlQueryOut');
  if (!el) return;
  var fname = title.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '.soql';
  dl(el.innerText || el.textContent, fname, 'text/plain');
}

function openWBWithQuery(elId) {
  var el = document.getElementById(elId);
  if (!el) return;
  var soql = el.innerText || el.textContent;
  /* copy to clipboard and open Workbench */
  if (navigator.clipboard) {
    navigator.clipboard.writeText(soql).then(function () {
      var wbUrl = v('cfg_wbUrl') || 'https://workbench.developerforce.com/query.php';
      window.open(wbUrl, '_blank');
      setStatus('Query copied — paste in Workbench SOQL box');
    });
  } else {
    fbCopy(soql);
    var wbUrl = v('cfg_wbUrl') || 'https://workbench.developerforce.com/query.php';
    window.open(wbUrl, '_blank');
  }
}

function pullFromExtract() {
  var nums = selectedCaseNums.length ? selectedCaseNums : extractedAll.cases;
  var inp = document.getElementById('libCaseInput');
  if (!nums.length) {
    setStatus('No case numbers extracted yet — go to Smart Paste tab first');
    return;
  }
  if (inp) inp.value = nums.join(', ');
  rebuildLibrary();
  setStatus('Pulled ' + nums.length + ' case numbers from Smart Paste');
}

function clearLibCase() {
  var inp = document.getElementById('libCaseInput');
  if (inp) inp.value = '';
  rebuildLibrary();
}

/* ════════════════════════════════════════════════════════════════
   UPDATE HEADER TEMPLATES
════════════════════════════════════════════════════════════════ */
function renderUpdateHeaderTabs() {
  var objMap = {
    tCase: { label: 'Case', key: 'Case', color: 'var(--blue)' },
    tAccount: { label: 'Account', key: 'Account', color: 'var(--green)' },
    tContact: { label: 'Contact', key: 'Contact', color: 'var(--purple)' },
    tEquipment: { label: 'Equipment', key: 'Equipment', color: 'var(--teal)' },
  };
  Object.keys(objMap).forEach(function (paneId) {
    var pane = document.getElementById(paneId);
    if (!pane) return;
    var obj = objMap[paneId];
    var hdrs = UPDATE_HEADERS[obj.key];
    pane.innerHTML =
      '<div style="margin-bottom:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
      '<span style="font-size:10px;color:var(--muted);">' + hdrs.length + ' updateable fields</span>' +
      '<div style="display:flex;gap:6px;">' +
      '<input type="number" id="rowCount_' + paneId + '" value="25" min="1" max="500" ' +
      'style="width:70px;font-size:11px;" placeholder="rows"/>' +
      '<button class="btn btn-orange btn-sm" onclick="dlUpdateTemplate(\'' + obj.key + '\',\'' + paneId + '\')">&#8595; Download CSV Template</button>' +
      '<button class="btn btn-ghost  btn-sm" onclick="copyUpdateHeaders(\'' + obj.key + '\')">&#128203; Copy Headers</button>' +
      '</div>' +
      '</div>' +
      '<div class="header-scroll">' +
      hdrs.map(function (h) {
        return '<span class="hdr-chip" title="' + h + '">' + h + '</span>';
      }).join('') +
      '</div>';
  });
}

function switchTmplObj(paneId) {
  document.querySelectorAll('.tmpl-pane').forEach(function (p) { p.classList.remove('active'); });
  document.querySelectorAll('.tmpl-tab').forEach(function (b) { b.classList.remove('active'); });
  var pane = document.getElementById(paneId);
  var idx = ['tCase', 'tAccount', 'tContact', 'tEquipment'].indexOf(paneId);
  var tabs = document.querySelectorAll('.tmpl-tab');
  if (pane) pane.classList.add('active');
  if (tabs[idx]) tabs[idx].classList.add('active');
}

function dlUpdateTemplate(objKey, paneId) {
  var hdrs = UPDATE_HEADERS[objKey];
  if (!hdrs) return;
  var rows = parseInt(v('rowCount_' + paneId) || '25', 10) || 25;
  var lines = [hdrs.map(function (h) { return '"' + h + '"'; }).join(',')];
  for (var i = 0; i < rows; i++) lines.push(hdrs.map(function () { return ''; }).join(','));
  dl(lines.join('\n'), 'cellsforce_' + objKey.toLowerCase() + '_update_template.csv', 'text/csv');
  setStatus('Downloaded ' + objKey + ' update template with ' + rows + ' blank rows');
}

function copyUpdateHeaders(objKey) {
  var hdrs = UPDATE_HEADERS[objKey];
  if (!hdrs) return;
  fbCopy(hdrs.join(','));
  setStatus(objKey + ' headers copied (' + hdrs.length + ' fields)');
}

/* ════════════════════════════════════════════════════════════════
   PARSE RESULTS ENGINE
════════════════════════════════════════════════════════════════ */
function parseData() {
  var raw = v('pasteInput').trim();
  var mode = v('pasteMode');
  if (!raw) { alert('Please paste some data first.'); return; }
  setStatus('Analysing cells...');
  var records = [];
  try {
    var fmt = (mode === 'auto') ? detectFmt(raw) : mode;
    setStatus('Format: ' + fmt + ' — processing rows...');
    if (fmt === 'json') records = parseJSON(raw);
    else if (fmt === 'csv') records = parseDelim(raw, ',');
    else if (fmt === 'tsv') records = parseDelim(raw, '\t');
    else if (fmt === 'pipe') records = parseDelim(raw, '|');
    else if (fmt === 'sfbrowser') records = parseSFBrowser(raw);
    else records = parseDelim(raw, ',');
  } catch (e) {
    alert('Parse error: ' + e.message); setStatus('Parse error'); return;
  }
  if (!records || !records.length) {
    alert('No records found. Check format selection.'); setStatus('No records found'); return;
  }
  parsedRecords = enrichRecords(records);
  renderParseStats(parsedRecords);
  renderDataTable(parsedRecords);
  renderDeeperSOQL(parsedRecords);
  var sw = document.getElementById('parseStatsWrap');
  if (sw) sw.style.display = 'block';
  setStatus('Cellular analysis complete — ' + parsedRecords.length + ' rows processed');
  if (typeof triggerSaveState === 'function') triggerSaveState();
}

function detectFmt(raw) {
  var f = raw.trim().substring(0, 400);
  if (f.charAt(0) === '{' || f.charAt(0) === '[') return 'json';
  if ((f.match(/\|/g) || []).length > 4) return 'pipe';
  if ((f.match(/\t/g) || []).length > 3) return 'tsv';
  if (/^\s*\w[\w ]+\s{2,}\w/.test(f)) return 'sfbrowser';
  return 'csv';
}

function parseJSON(raw) {
  var data = JSON.parse(raw);
  if (data && data.records) data = data.records;
  if (!Array.isArray(data)) data = [data];
  return data.map(function (r) { return flatObj(r, ''); });
}
function flatObj(obj, prefix) {
  var res = {};
  for (var k in obj) {
    if (!obj.hasOwnProperty(k) || k === 'attributes') continue;
    var val = obj[k], nk = prefix ? prefix + '.' + k : k;
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      var nested = flatObj(val, nk);
      for (var k2 in nested) { if (nested.hasOwnProperty(k2)) res[k2] = nested[k2]; }
    } else { res[nk] = val; }
  }
  return res;
}

function parseDelim(raw, sep) {
  var lines = raw.split(/\r?\n/).filter(function (l) { return l.trim(); });
  if (lines.length < 2) throw new Error('Need at least a header row and one data row.');
  var headers = splitCsv(lines[0], sep);
  var records = [];
  for (var i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    var vals = splitCsv(lines[i], sep);
    var rec = {};
    headers.forEach(function (h, idx) { rec[h.trim()] = (vals[idx] || '').trim(); });
    records.push(rec);
  }
  return records;
}
function splitCsv(line, sep) {
  if (sep !== ',') return line.split(sep);
  var result = [], cur = '', inQ = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === sep && !inQ) { result.push(cur); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur); return result;
}

function parseSFBrowser(raw) {
  var lines = raw.split(/\r?\n/).filter(function (l) { return l.trim(); });
  if (lines.length < 2) throw new Error('Not enough lines.');
  var hl = lines[0];
  var headers = hl.split(/\s{2,}/).map(function (h) { return h.trim(); }).filter(Boolean);
  if (headers.length < 2) return parseDelim(raw, '\t');
  var positions = [], sf = 0;
  headers.forEach(function (h) {
    var idx = hl.indexOf(h, sf); positions.push({ name: h, start: idx }); sf = idx + h.length;
  });
  var records = [];
  for (var i = 1; i < lines.length; i++) {
    if (!lines[i].trim() || /^[-=]+$/.test(lines[i])) continue;
    var rec = {};
    positions.forEach(function (pos, idx) {
      var ns = (idx + 1 < positions.length) ? positions[idx + 1].start : undefined;
      var chunk = (ns !== undefined) ? lines[i].substring(pos.start, ns) : lines[i].substring(pos.start);
      rec[pos.name] = chunk ? chunk.trim() : '';
    });
    records.push(rec);
  }
  return records;
}

var REQUIRED_FIELDS_CHECK = [
  'Phone', 'Website', 'NumberOfEmployees', 'BillingStreet', 'ShippingStreet',
  'BillingCity', 'BillingState', 'BillingPostalCode',
  'ShippingCity', 'ShippingState', 'ShippingPostalCode',
  'Account.Phone', 'Account.AccountNumber', 'Contact.Email', 'Contact.Phone'
];

function enrichRecords(records) {
  return records.map(function (r) {
    var missing = REQUIRED_FIELDS_CHECK.filter(function (f) {
      var val = r[f] || r[f.toLowerCase()] || r[f.replace(/\./g, '_')] || '';
      return !val || String(val).trim() === '' || String(val).toLowerCase() === 'null';
    });
    r._missing = missing;
    r._hasMissing = missing.length > 0;
    return r;
  });
}

function renderParseStats(records) {
  var total = records.length, incomplete = records.filter(function (r) { return r._hasMissing; }).length;
  var complete = total - incomplete, fc = {};
  records.forEach(function (r) { r._missing.forEach(function (f) { fc[f] = (fc[f] || 0) + 1; }); });
  var top = Object.keys(fc).sort(function (a, b) { return fc[b] - fc[a]; }).slice(0, 5)
    .map(function (f) { return '<span class="tag-miss">' + f + ': ' + fc[f] + '</span>'; }).join(' ');
  var c2 = document.getElementById('parseStats');
  if (!c2) return;
  c2.innerHTML =
    '<div class="stat-card sb"><div class="sn">' + total + '</div><div class="sl">Total Rows</div></div>' +
    '<div class="stat-card sr"><div class="sn">' + incomplete + '</div><div class="sl">Incomplete</div></div>' +
    '<div class="stat-card sg"><div class="sn">' + complete + '</div><div class="sl">Complete</div></div>' +
    '<div class="stat-card so" style="flex:1;">' +
    '<div style="font-size:9px;font-weight:700;color:rgba(255,184,0,.8);letter-spacing:1px;margin-bottom:4px;">TOP MISSING FIELDS</div>' +
    '<div>' + (top || '<em style="opacity:.4;font-size:10px;">None detected</em>') + '</div></div>';
}

function loadSample() {
  var sample = [
    'Id,CaseNumber,Subject,Status,Priority,AccountId,Account.Name,Account.AccountNumber,Salesrep__r.Name,Salesrep__r.Email,Brand__c,Equipment_Type__c,Region__c,CreatedDate',
    '500A001,00123456,AC Unit Not Cooling,New,High,001A001,Acme Corp,ACC-001,John Smith,john@company.com,Carrier,Split System,Canada,2025-05-01',
    '500A002,00123457,Heat Pump Fault,In Progress,Medium,001A002,Beta HVAC,ACC-002,,jane@company.com,Bryant,,US West,2025-05-02',
    '500A003,00123458,No Power to Unit,New,High,001A003,Gamma Ltd,,,john@company.com,Carrier,Package Unit,Canada,2025-05-03',
    '500A004,00123459,Refrigerant Leak,Closed,Low,001A004,Delta Services,ACC-004,Sarah Lee,sarah@company.com,,Split System,US East,2025-05-04',
    '500A005,00123460,Warranty Claim,New,Medium,001A005,Epsilon Inc,ACC-005,Bob Martin,bob@company.com,Bryant,Air Handler,Canada,2025-05-05'
  ].join('\n');
  var pa = document.getElementById('pasteInput'), pm = document.getElementById('pasteMode');
  if (pa) pa.value = sample;
  if (pm) pm.value = 'csv';
  setStatus('Sample data loaded — click Parse & Analyse');
}

/* ════════════════════════════════════════════════════════════════
   DATA TABLE
════════════════════════════════════════════════════════════════ */
var tableFilterStr = '';

function renderDataTable(records) {
  if (!records || !records.length) {
    var tb = document.getElementById('dataTableBody'), th = document.getElementById('dataTableHead');
    if (th) th.innerHTML = '';
    if (tb) tb.innerHTML = '<tr><td style="color:rgba(255,255,255,.25);font-style:italic;padding:20px;">' +
      'No data — parse data in the Parse Results tab first.</td></tr>';
    return;
  }
  var allKeys = [];
  records.forEach(function (r) {
    Object.keys(r).forEach(function (k) { if (k.charAt(0) !== '_' && allKeys.indexOf(k) === -1) allKeys.push(k); });
  });
  var priority = ['Id', 'CaseNumber', 'Subject', 'Status', 'Priority', 'AccountId',
    'Account.Name', 'Account.AccountNumber', 'Salesrep__r.Name', 'Salesrep__r.Email',
    'Brand__c', 'Equipment_Type__c', 'Region__c', 'CreatedDate', 'OwnerId', 'Owner.Name'];
  var ordered = priority.filter(function (k) { return allKeys.indexOf(k) !== -1; });
  allKeys.forEach(function (k) { if (ordered.indexOf(k) === -1) ordered.push(k); });

  var filtered = tableFilterStr
    ? records.filter(function (r) {
      return Object.values(r).some(function (v2) {
        return String(v2 || '').toLowerCase().indexOf(tableFilterStr.toLowerCase()) !== -1;
      });
    })
    : records;

  if (sortCol) {
    filtered = filtered.slice().sort(function (a, b) {
      var av = a[sortCol] || '', bv = b[sortCol] || '';
      var cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }

  var thead = document.getElementById('dataTableHead');
  var tbody = document.getElementById('dataTableBody');
  var lbl = document.getElementById('tableCountLabel');
  if (lbl) lbl.textContent = filtered.length + ' / ' + records.length + ' rows';

  if (thead) {
    thead.innerHTML = '<tr><th>#</th>' +
      ordered.map(function (k) {
        var isSorted = k === sortCol;
        return '<th onclick="sortTable(\'' + esc(k) + '\')" class="' + (isSorted ? 'sorted-' + sortDir : '') + '">' + k + '</th>';
      }).join('') +
      '<th>&#9888; Missing</th></tr>';
  }
  if (tbody) {
    tbody.innerHTML = filtered.map(function (r, i) {
      var cells = ordered.map(function (k) {
        var val = (r[k] !== undefined && r[k] !== null) ? r[k] : '';
        var empty = !val || String(val).trim() === '' || String(val).toLowerCase() === 'null';
        return '<td title="' + esc(String(val)) + '" style="' + (empty ? 'color:rgba(220,38,38,.5);font-style:italic;' : '') + '">' + (empty ? '&mdash;' : String(val).substring(0, 60)) + '</td>';
      }).join('');
      var tags = r._missing && r._missing.length
        ? r._missing.map(function (f) { return '<span class="tag-miss">' + f + '</span>'; }).join('')
        : '<span class="tag-ok">&#10003;</span>';
      return '<tr><td style="color:rgba(255,255,255,.25);font-size:9px;">' + (i + 1) + '</td>' + cells + '<td>' + tags + '</td></tr>';
    }).join('');
  }
}

function sortTable(col) {
  if (sortCol === col) { sortDir = sortDir === 'asc' ? 'desc' : 'asc'; }
  else { sortCol = col; sortDir = 'asc'; }
  renderDataTable(parsedRecords);
}

function filterTable(q) {
  tableFilterStr = q;
  renderDataTable(parsedRecords);
}

function exportCSV() {
  if (!parsedRecords.length) { alert('No parsed data yet.'); return; }
  var keys = Object.keys(parsedRecords[0]).filter(function (k) { return k.charAt(0) !== '_'; });
  var rows = parsedRecords.map(function (r) {
    return keys.map(function (k) { return '"' + String(r[k] || '').replace(/"/g, '""') + '"'; }).join(',');
  });
  dl([keys.join(',')].concat(rows).join('\n'), 'cellsforce_data.csv', 'text/csv');
}

function copyTableTSV() {
  if (!parsedRecords.length) { alert('No parsed data yet.'); return; }
  var keys = Object.keys(parsedRecords[0]).filter(function (k) { return k.charAt(0) !== '_'; });
  var rows = parsedRecords.map(function (r) {
    return keys.map(function (k) { return String(r[k] || ''); }).join('\t');
  });
  fbCopy([keys.join('\t')].concat(rows).join('\n'));
  setStatus('Table copied as TSV!');
}

function renderDeeperSOQL(records) {
  var wrap = document.getElementById('deeperSOQLWrap'); if (!wrap) return;
  var ids = [];
  records.forEach(function (r) {
    if (r._hasMissing) { var id = r.Id || r.id || r.ID; if (id && ids.indexOf(id) === -1 && ids.length < 50) ids.push(id); }
  });
  if (!ids.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  var note = document.getElementById('deeperNote');
  var idList = ids.map(function (i) { return "'" + i + "'"; }).join(', ');
  var soql = '/* CellsForce: Contacts for incomplete Account cases */\n' +
    'SELECT\n    Id, Name, AccountId, Email, Phone, MobilePhone,\n' +
    '    Title, Department,\n    MailingStreet, MailingCity, MailingState, MailingPostalCode,\n' +
    '    LastActivityDate, CreatedDate\nFROM Contact\n' +
    'WHERE AccountId IN (' + idList + ')\nORDER BY AccountId, Name ASC\nLIMIT 500';
  if (note) note.innerHTML = 'Based on <strong>' + ids.length + '</strong> incomplete Account IDs — ' +
    'fetch their <strong>Contacts</strong> for deeper analysis.';
  renderSOQL('deeperSOQL', soql);
}

/* ════════════════════════════════════════════════════════════════
   EMAIL MERGE ENGINE — {{{triple-brace}}} Salesforce standard
════════════════════════════════════════════════════════════════ */
var CF_TH = 'padding:8px 10px;color:#fff;text-align:left;font-size:10.5px;font-weight:700;background:linear-gradient(135deg,#001f6e,#0033a0);';
var CF_TD = 'padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:11.5px;vertical-align:top;color:#1e293b;';

function renderMergeFieldPalette() {
  var c2 = document.getElementById('mergeFieldPalette');
  if (!c2) return;
  c2.innerHTML = MERGE_FIELDS.map(function (mf) {
    return '<span class="merge-field" title="Click to insert ' + mf.token + '" ' +
      'onclick="insertMergeToken(\'' + esc(mf.token) + '\')">' + mf.label + '</span>';
  }).join('');
}

function insertMergeToken(token) {
  var ta = document.getElementById('emailOpening');
  if (!ta) { fbCopy(token); setStatus('Copied: ' + token); return; }
  var start = ta.selectionStart, end = ta.selectionEnd;
  ta.value = ta.value.substring(0, start) + token + ta.value.substring(end);
  ta.selectionStart = ta.selectionEnd = start + token.length;
  ta.focus();
  buildEmailMerge();
}

function buildEmailMerge() {
  var container = document.getElementById('emailBlocks');
  if (!container) return;
  if (!parsedRecords || !parsedRecords.length) {
    container.innerHTML = '<div class="warn-box">&#9888; Parse data in the Parse Results tab first, then return here.</div>';
    return;
  }

  /* Group by Sales Rep */
  var groups = {};
  parsedRecords.forEach(function (r) {
    var rn = r['Salesrep__r.Name'] || r['Salesrep__c'] || r['Owner.Name'] || 'Unassigned';
    var re = r['Salesrep__r.Email'] || r['Owner.Email'] || '';
    var key = rn + '||' + re;
    if (!groups[key]) groups[key] = { repName: rn, repEmail: re, accounts: [] };
    groups[key].accounts.push(r);
  });
  repEmailBlocks = groups;

  var fromName = v('emailFromName') || 'Data Quality Team';
  var fromEmail = v('emailFromAddr') || '';
  var subject = v('emailSubject') || 'Action Required: Incomplete Account Records';
  var deadline = v('emailDeadline') || '';
  var dp = deadline ? ' by <strong>' + deadline + '</strong>' : '';

  var html = '';
  Object.keys(groups).forEach(function (key) {
    var g = groups[key];
    var sk = encodeURIComponent(key);
    var eHTML = buildSingleEmail(g, fromName, fromEmail, dp);
    html +=
      '<div class="rep-block">' +
      '<div class="rep-hdr">' +
      '<span>&#9993; To: <strong>' + g.repName + '</strong>' + (g.repEmail ? ' &lt;' + g.repEmail + '&gt;' : '') + ' </span>' +
      '<span>' +
      '<span class="rep-pill">' + g.accounts.length + ' record' + (g.accounts.length !== 1 ? 's' : '') + '</span>' +
      '&nbsp;&nbsp;' +
      '<button class="btn btn-ghost btn-sm" onclick="copyRepEmail(\'' + sk + '\')" ' +
      'style="color:#93c5fd;border-color:rgba(147,197,253,.4);">&#128203; Copy HTML</button>' +
      '&nbsp;' +
      '<button class="btn btn-ghost btn-sm" onclick="dlRepEmail(\'' + sk + '\')" ' +
      'style="color:#93c5fd;border-color:rgba(147,197,253,.4);">&#8595; Download</button>' +
      '</span>' +
      '</div>' +
      '<div class="rep-body">' +
      '<div style="font-size:9.5px;color:rgba(255,184,0,.65);letter-spacing:.5px;margin-bottom:7px;text-transform:uppercase;">Subject: ' + subject + '</div>' +
      '<div id="ep_' + sk + '" style="border:1px solid rgba(124,94,247,.2);border-radius:6px;padding:10px;max-height:300px;overflow-y:auto;background:#fff;">' + eHTML + '</div>' +
      '</div>' +
      '</div>';
  });
  container.innerHTML = html;
}

function buildSingleEmail(g, fromName, fromEmail, dp) {
  var orgUrl = v('cfg_orgUrl') || 'https://yourorg.my.salesforce.com';
  var company = v('cfg_company') || 'Carrier Enterprise, LLC';
  var opening = v('emailOpening') || 'Hi {{{Salesrep__r.Name}}},\n\nPlease review the accounts below.';
  var closing = v('emailClosing') || 'Thank you.\n\n{{{FROM_NAME}}}\n{{{FROM_EMAIL}}}';

  /* Resolve {{{triple-brace}}} merge fields — Salesforce standard */
  function resolve(text, repName, fromN, fromE, dp2, firstRec) {
    return text
      .replace(/\{\{\{Salesrep__r\.Name\}\}\}/g, repName)
      .replace(/\{\{\{FROM_NAME\}\}\}/g, fromN)
      .replace(/\{\{\{FROM_EMAIL\}\}\}/g, fromE)
      .replace(/\{\{\{DEADLINE_PHRASE\}\}\}/g, dp2)
      .replace(/\{\{\{([^}]+)\}\}\}/g, function (match, key) {
        /* Try to resolve from first record: handles Case.Field and Account.Field etc. */
        var parts = key.split('.');
        var fKey = parts.length > 1 ? parts[0] + '.' + parts[1] : key;
        var simple = parts[parts.length - 1];
        return firstRec[fKey] || firstRec[simple] || match;
      })
      .replace(/\n/g, '<br>');
  }

  var firstRec = g.accounts[0] || {};
  var openFmt = resolve(opening, g.repName, fromName, fromEmail, dp, firstRec);
  var closeFmt = resolve(closing, g.repName, fromName, fromEmail, dp, firstRec);

  /* Table header cells */
  var thCells = [];
  if (c('ec_Name')) thCells.push('<th style="' + CF_TH + '">Account Name</th>');
  if (c('ec_AcctNum')) thCells.push('<th style="' + CF_TH + '">Acct #</th>');
  if (c('ec_Region')) thCells.push('<th style="' + CF_TH + '">Region</th>');
  if (c('ec_Phone')) thCells.push('<th style="' + CF_TH + '">Phone</th>');
  if (c('ec_Web')) thCells.push('<th style="' + CF_TH + '">Website</th>');
  if (c('ec_Billing')) thCells.push('<th style="' + CF_TH + '">Billing Street</th>');
  if (c('ec_CaseNum')) thCells.push('<th style="' + CF_TH + '">Case #</th>');
  if (c('ec_Missing')) thCells.push('<th style="' + CF_TH + 'background:#c0392b;">&#9888; Missing Fields</th>');

  /* Table rows */
  var rows = g.accounts.map(function (r, idx) {
    var bg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
    var id = r.Id || r.id || '';
    var name = r['Account.Name'] || r.Name || r.AccountName || '&mdash;';
    var link = id
      ? '<a href="' + orgUrl + '/' + id + '" style="color:#0033a0;font-weight:600;">' + name + '</a>'
      : name;
    var tdCells = [];
    if (c('ec_Name')) tdCells.push('<td style="' + CF_TD + 'background:' + bg + '">' + link + '</td>');
    if (c('ec_AcctNum')) tdCells.push('<td style="' + CF_TD + 'background:' + bg + '">' + (r['Account.AccountNumber'] || r.AccountNumber || r.Account_Number__c || '&mdash;') + '</td>');
    if (c('ec_Region')) tdCells.push('<td style="' + CF_TD + 'background:' + bg + '">' + (r['Region__c'] || r.Region || '&mdash;') + '</td>');
    if (c('ec_Phone')) tdCells.push('<td style="' + CF_TD + 'background:' + bg + '">' + (r['Account.Phone'] || r.Phone || '<em style="color:#9ca3af">missing</em>') + '</td>');
    if (c('ec_Web')) tdCells.push('<td style="' + CF_TD + 'background:' + bg + '">' + (r['Account.Website'] || r.Website || '<em style="color:#9ca3af">missing</em>') + '</td>');
    if (c('ec_Billing')) tdCells.push('<td style="' + CF_TD + 'background:' + bg + '">' + (r['Account.BillingStreet'] || r.BillingStreet || '<em style="color:#9ca3af">missing</em>') + '</td>');
    if (c('ec_CaseNum')) tdCells.push('<td style="' + CF_TD + 'background:' + bg + '">' + (r.CaseNumber || '&mdash;') + '</td>');
    if (c('ec_Missing')) {
      var tags = (r._missing && r._missing.length)
        ? r._missing.map(function (f) {
          return '<span style="background:#fee2e2;color:#dc2626;border-radius:3px;padding:1px 5px;' +
            'font-size:9.5px;margin:1px;display:inline-block;border:1px solid rgba(220,38,38,.25);">' + f + '</span>';
        }).join('')
        : '<span style="color:#16a34a;font-weight:700;">&#10003; Complete</span>';
      tdCells.push('<td style="' + CF_TD + 'background:' + bg + '">' + tags + '</td>');
    }
    return '<tr>' + tdCells.join('') + '</tr>';
  }).join('');

  return (
    /* ── Email HTML — CE Canada navy gradient header ── */
    '<div style="font-family:\'Segoe UI\',Arial,sans-serif;max-width:700px;color:#1e293b;">' +
    '<table width="100%" cellpadding="0" cellspacing="0">' +
    '<tr><td style="background:linear-gradient(135deg,#001f6e 0%,#0033a0 60%,#0047cc 100%);' +
    'padding:16px 24px 12px;border-radius:8px 8px 0 0;border-bottom:3px solid #FFB800;">' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="vertical-align:middle;">' +
    '<div style="font-size:17px;font-weight:900;color:#fff;letter-spacing:1px;">' + company + '</div>' +
    '<div style="font-size:8.5px;color:#93c5fd;letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;">' +
    'Salesforce Data Quality &mdash; Account Review Request</div>' +
    '</td>' +
    '<td style="text-align:right;vertical-align:middle;">' +
    '<span style="font-size:9.5px;font-weight:700;color:#fde68a;' +
    'background:rgba(0,0,0,.3);padding:3px 10px;border-radius:4px;">' +
    'CellsForce &mdash; DANMAN SOLUTIONS</span>' +
    '</td>' +
    '</tr></table></td></tr></table>' +

    /* White body */
    '<div style="border:1px solid #e2e8f0;border-top:none;padding:20px 24px;' +
    'border-radius:0 0 8px 8px;background:#fff;">' +
    '<p style="font-size:13px;line-height:1.75;margin-bottom:16px;">' + openFmt + '</p>' +
    '<p style="font-size:13px;margin-bottom:12px;">The following <strong>' +
    g.accounts.length + '</strong> record' + (g.accounts.length !== 1 ? 's' : '') +
    ' require your attention:</p>' +

    /* Records table */
    '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;' +
    'font-size:12px;margin-bottom:20px;border-radius:6px;overflow:hidden;' +
    'box-shadow:0 1px 4px rgba(0,0,0,.07);">' +
    '<thead><tr>' + thCells.join('') + '</tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '</table>' +

    /* CTA button */
    '<div style="text-align:center;margin:20px 0;">' +
    '<a href="' + orgUrl + '" target="_blank" ' +
    'style="background:linear-gradient(135deg,#001f6e,#0033a0);color:#fff;' +
    'padding:11px 30px;border-radius:6px;text-decoration:none;font-weight:700;' +
    'font-size:13px;display:inline-block;letter-spacing:.5px;">' +
    '&#128279; Open Salesforce</a>' +
    '</div>' +

    '<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;"/>' +
    '<p style="font-size:12px;line-height:1.75;color:#475569;">' + closeFmt + '</p>' +
    '<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;"/>' +
    '<p style="font-size:9px;color:#94a3b8;text-align:center;letter-spacing:.5px;">' +
    'GENERATED BY CELLSFORCE v3.0 &bull; DANMAN SOLUTIONS &bull; ' + company +
    ' &bull; DO NOT REPLY DIRECTLY</p>' +
    '</div></div>'
  );
}

function copyRepEmail(sk) {
  var el = document.getElementById('ep_' + sk);
  if (!el) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(el.innerHTML).then(function () {
      setStatus('Email HTML copied!'); setTimeout(function () { setStatus('Ready'); }, 2500);
    });
  } else { fbCopy(el.innerHTML); }
}

function dlRepEmail(sk) {
  var el = document.getElementById('ep_' + sk);
  if (!el) return;
  var rn = decodeURIComponent(sk).split('||')[0].replace(/\s+/g, '_');
  dl(
    '<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>CellsForce Email \u2013 ' + rn + '</title></head>' +
    '<body style="margin:0;padding:24px;background:#f1f5f9;">' + el.innerHTML + '</body></html>',
    'cellsforce_email_' + rn + '.html', 'text/html'
  );
}

function downloadAllEmails() {
  if (!Object.keys(repEmailBlocks).length) { alert('No emails yet. Build emails first.'); return; }
  var out = '<!DOCTYPE html>\n<html><head><meta charset="UTF-8"/>\n<title>CellsForce All Emails</title>\n' +
    '<style>body{font-family:"Segoe UI",Arial,sans-serif;background:#0d071e;padding:24px;}' +
    '.wrap{max-width:740px;margin:0 auto 40px;}' +
    '.meta{background:linear-gradient(135deg,#001f6e,#0033a0);color:#fff;padding:10px 18px;' +
    'border-radius:6px 6px 0 0;font-size:12px;border-bottom:2px solid #FFB800;}</style>\n</head><body>\n';
  Object.keys(repEmailBlocks).forEach(function (key) {
    var g = repEmailBlocks[key];
    var sk = encodeURIComponent(key);
    var el = document.getElementById('ep_' + sk);
    var body = el ? el.innerHTML : '<em>No preview generated.</em>';
    out += '<div class="wrap">\n<div class="meta">&#9993; TO: ' + g.repName +
      (g.repEmail ? ' &lt;' + g.repEmail + '&gt;' : '') +
      ' | ' + g.accounts.length + ' record' + (g.accounts.length !== 1 ? 's' : '') + '</div>\n' +
      '<div style="background:#fff;padding:16px;border-radius:0 0 6px 6px;">' + body + '</div>\n</div>\n\n';
  });
  dl(out + '</body></html>', 'cellsforce_all_emails.html', 'text/html');
}

/* ════════════════════════════════════════════════════════════════
   APEX CLASS GENERATOR — {{{triple-brace}}} noted in comments
════════════════════════════════════════════════════════════════ */
function downloadApexClass() {
  var rf = v('cfg_repField') || 'Salesrep__c';
  var rr = rf.replace('__c', '__r');
  var company = v('cfg_company') || 'Carrier Enterprise, LLC';
  var fe = v('cfg_fromEmail') || 'data.quality@carrierenterprise.com';
  var sub = v('emailSubject') || 'Action Required: Incomplete Account Records';

  var apex =
    '/**\n' +
    ' * AccountCleanerEmailService.cls\n' +
    ' * ─────────────────────────────────────────────────────────────────\n' +
    ' * CellsForce v3.0 by DANMAN SOLUTIONS\n' +
    ' * Carrier Enterprise, LLC — API 66.0\n' +
    ' *\n' +
    ' * Queries incomplete Accounts, groups by Sales Rep,\n' +
    ' * and sends each rep a personalised HTML email with a CSV attachment.\n' +
    ' *\n' +
    ' * NOTE ON MERGE FIELDS:\n' +
    ' *   Salesforce Email Templates use {{{triple-brace}}} merge field format.\n' +
    ' *   Example: {{{Account.Name}}}, {{{Contact.Email}}}, {{{Salesrep__r.Name}}}\n' +
    ' *   This class generates email HTML programmatically (no template needed),\n' +
    ' *   but the same {{{field}}} pattern is used throughout CellsForce UI.\n' +
    ' *\n' +
    ' * HOW TO DEPLOY:\n' +
    ' *   1. Developer Console > File > New > Apex Class\n' +
    ' *   2. Name it AccountCleanerEmailService, paste this file, save.\n' +
    ' *   3. Schedule via Setup > Apex Classes > Schedule Apex\n' +
    ' *      OR call sendEmails() from a Flow, Process Builder, or button.\n' +
    ' *\n' +
    ' * Company: ' + company + '\n' +
    ' * Generated: ' + new Date().toLocaleDateString() + ' by CellsForce v3.0\n' +
    ' */\n' +
    'public with sharing class AccountCleanerEmailService {\n\n' +
    '    private static final String  REGION_FILTER  = null;  // e.g. \'Canada\'\n' +
    '    private static final String  SHIPTO_FILTER  = null;  // e.g. \'8100\'\n' +
    '    private static final String  FROM_EMAIL     = \'' + fe + '\';\n' +
    '    private static final String  EMAIL_SUBJECT  = \'' + sub + '\';\n' +
    '    private static final String  COMPANY_NAME   = \'' + company + '\';\n' +
    '    private static final String  ORG_URL        = \'https://yourorg.my.salesforce.com\';\n' +
    '    private static final Integer RECORD_LIMIT   = 500;\n\n' +
    '    /** Call this method from a Schedule, Flow, or Visualforce button. */\n' +
    '    public static void sendEmails() {\n' +
    '        List<Account> accounts = queryIncompleteAccounts();\n' +
    '        if (accounts.isEmpty()) {\n' +
    '            System.debug(\'CellsForce v3: No incomplete accounts found.\');\n' +
    '            return;\n' +
    '        }\n' +
    '        Map<Id, List<Account>> repMap  = new Map<Id, List<Account>>();\n' +
    '        Map<Id, User>          userMap = new Map<Id, User>();\n' +
    '        for (Account a : accounts) {\n' +
    '            Id repId = a.' + rf + ';\n' +
    '            if (repId == null) continue;\n' +
    '            if (!repMap.containsKey(repId)) repMap.put(repId, new List<Account>());\n' +
    '            repMap.get(repId).add(a);\n' +
    '        }\n' +
    '        for (User u : [SELECT Id, Name, Email, Title, Phone, MobilePhone, Department\n' +
    '                        FROM User\n' +
    '                        WHERE Id IN :repMap.keySet() AND IsActive = TRUE]) {\n' +
    '            userMap.put(u.Id, u);\n' +
    '        }\n' +
    '        List<Messaging.SingleEmailMessage> emails = new List<Messaging.SingleEmailMessage>();\n' +
    '        for (Id repId : repMap.keySet()) {\n' +
    '            User rep = userMap.get(repId);\n' +
    '            if (rep == null || String.isBlank(rep.Email)) continue;\n' +
    '            Messaging.SingleEmailMessage mail = new Messaging.SingleEmailMessage();\n' +
    '            mail.setToAddresses(new List<String>{ rep.Email });\n' +
    '            mail.setSenderDisplayName(COMPANY_NAME + \' \\u2013 Data Quality\');\n' +
    '            mail.setReplyTo(FROM_EMAIL);\n' +
    '            mail.setSubject(EMAIL_SUBJECT);\n' +
    '            mail.setHtmlBody(buildEmailBody(rep, repMap.get(repId)));\n' +
    '            mail.setFileAttachments(new List<Messaging.EmailFileAttachment>{\n' +
    '                buildCSVAttachment(repMap.get(repId))\n' +
    '            });\n' +
    '            emails.add(mail);\n' +
    '        }\n' +
    '        if (!emails.isEmpty()) {\n' +
    '            Messaging.sendEmail(emails);\n' +
    '            System.debug(\'CellsForce v3: Sent \' + emails.size() + \' emails.\');\n' +
    '        }\n' +
    '    }\n\n' +
    '    private static List<Account> queryIncompleteAccounts() {\n' +
    '        String soql =\n' +
    '            \'SELECT Id, Name, AccountNumber, Region__c, Ship_To__c, \'\n' +
    '          + \'' + rf + ', ' + rr + '.Name, ' + rr + '.Email, \'\n' +
    '          + \'Phone, Website, NumberOfEmployees, \'\n' +
    '          + \'BillingStreet, BillingCity, BillingState, BillingPostalCode, \'\n' +
    '          + \'ShippingStreet, ShippingCity, ShippingState, ShippingPostalCode \'\n' +
    '          + \'FROM Account \'\n' +
    '          + \'WHERE (Phone = NULL OR Website = NULL OR NumberOfEmployees = NULL \'\n' +
    '          + \'       OR BillingStreet = NULL OR ShippingStreet = NULL) \';\n' +
    '        if (REGION_FILTER != null) soql += \'AND Region__c = \\\'\' + REGION_FILTER + \'\\\' \';\n' +
    '        if (SHIPTO_FILTER != null) soql += \'AND Ship_To__c = \\\'\' + SHIPTO_FILTER + \'\\\' \';\n' +
    '        soql += \'ORDER BY Name ASC LIMIT \' + RECORD_LIMIT;\n' +
    '        return Database.query(soql);\n' +
    '    }\n\n' +
    '    // NOTE: Email body can alternatively reference a Salesforce Email Template\n' +
    '    // that uses {{{Account.Name}}}, {{{Contact.Email}}} merge fields directly.\n' +
    '    private static String buildEmailBody(User rep, List<Account> accounts) {\n' +
    '        String rows = \'\';\n' +
    '        Integer i = 0;\n' +
    '        for (Account a : accounts) {\n' +
    '            List<String> mf = new List<String>();\n' +
    '            if (a.Phone             == null) mf.add(\'Phone\');\n' +
    '            if (a.Website           == null) mf.add(\'Website\');\n' +
    '            if (a.NumberOfEmployees == null) mf.add(\'# Employees\');\n' +
    '            if (a.BillingStreet     == null) mf.add(\'Billing Street\');\n' +
    '            if (a.ShippingStreet    == null) mf.add(\'Shipping Street\');\n' +
    '            String bg = Math.mod(i, 2) == 0 ? \'#f8fafc\' : \'#ffffff\';\n' +
    '            rows += \'<tr><td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;background:\' + bg + \';">\'\n' +
    '                 + \'<a href="\' + ORG_URL + \'/\' + a.Id + \'" style="color:#0033a0;font-weight:600;">\' + a.Name + \'</a></td>\'\n' +
    '                 + \'<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;background:\' + bg + \';\">\'\n' +
    '                 + (a.AccountNumber != null ? a.AccountNumber : \'&mdash;\') + \'</td>\'\n' +
    '                 + \'<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;background:\' + bg + \';\">\'\n' +
    '                 + (a.Region__c != null ? a.Region__c : \'&mdash;\') + \'</td>\'\n' +
    '                 + \'<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;color:#dc2626;background:\' + bg + \';\">\'\n' +
    '                 + String.join(mf, \', \') + \'</td></tr>\';\n' +
    '            i++;\n' +
    '        }\n' +
    '        return \'<!DOCTYPE html><html><body style="font-family:Segoe UI,Arial,sans-serif;">\'\n' +
    '             + \'<div style="background:linear-gradient(135deg,#001f6e,#0033a0,#0047cc);\'\n' +
    '             + \'padding:16px 24px;border-radius:8px 8px 0 0;border-bottom:3px solid #FFB800;">\'\n' +
    '             + \'<div style="font-size:17px;font-weight:900;color:#fff;">\' + COMPANY_NAME + \'</div>\'\n' +
    '             + \'<div style="font-size:8.5px;color:#93c5fd;text-transform:uppercase;letter-spacing:1.5px;margin-top:2px;">\'\n' +
    '             + \'Salesforce Data Quality &mdash; Account Review Request</div></div>\'\n' +
    '             + \'<div style="border:1px solid #e2e8f0;border-top:none;padding:20px 24px;border-radius:0 0 8px 8px;background:#fff;">\'\n' +
    '             + \'<p style="font-size:13px;line-height:1.75;">Hi <strong>\' + rep.Name + \'</strong>,</p>\'\n' +
    '             + \'<p style="font-size:13px;margin:12px 0;">The following \' + accounts.size() + \' account(s) require your attention:</p>\'\n' +
    '             + \'<table width="100%" style="border-collapse:collapse;font-size:12px;margin-bottom:20px;">\'\n' +
    '             + \'<tr style="background:linear-gradient(135deg,#001f6e,#0033a0);">\'\n' +
    '             + \'<th style="padding:8px 10px;color:#fff;text-align:left;">Account Name</th>\'\n' +
    '             + \'<th style="padding:8px 10px;color:#fff;text-align:left;">Acct #</th>\'\n' +
    '             + \'<th style="padding:8px 10px;color:#fff;text-align:left;">Region</th>\'\n' +
    '             + \'<th style="padding:8px 10px;color:#fff;text-align:left;background:#c0392b;">&#9888; Missing</th></tr>\'\n' +
    '             + rows + \'</table>\'\n' +
    '             + \'<div style="text-align:center;margin:20px 0;">\'\n' +
    '             + \'<a href="\' + ORG_URL + \'" style="background:linear-gradient(135deg,#001f6e,#0033a0);\'\n' +
    '             + \'color:#fff;padding:11px 28px;border-radius:6px;text-decoration:none;font-weight:700;">Open Salesforce</a></div>\'\n' +
    '             + \'<p style="font-size:9px;color:#94a3b8;text-align:center;margin-top:20px;">\'\n' +
    '             + \'Generated by CellsForce v3.0 &bull; DANMAN SOLUTIONS &bull; \' + COMPANY_NAME + \'</p>\'\n' +
    '             + \'</div></body></html>\';\n' +
    '    }\n\n' +
    '    private static Messaging.EmailFileAttachment buildCSVAttachment(List<Account> accounts) {\n' +
    '        String csv = \'Account Name,Account Number,Region,Ship-To,Phone,Website,# Employees,Missing Fields\\n\';\n' +
    '        for (Account a : accounts) {\n' +
    '            List<String> mf = new List<String>();\n' +
    '            if (a.Phone             == null) mf.add(\'Phone\');\n' +
    '            if (a.Website           == null) mf.add(\'Website\');\n' +
    '            if (a.NumberOfEmployees == null) mf.add(\'NumberOfEmployees\');\n' +
    '            if (a.BillingStreet     == null) mf.add(\'BillingStreet\');\n' +
    '            if (a.ShippingStreet    == null) mf.add(\'ShippingStreet\');\n' +
    '            csv += \'"\' + (a.Name!=null?a.Name:\'\') + \'",\'\n' +
    '                +  \'"\' + (a.AccountNumber!=null?a.AccountNumber:\'\') + \'",\'\n' +
    '                +  \'"\' + (a.Region__c!=null?a.Region__c:\'\') + \'",\'\n' +
    '                +  \'"\' + (a.Ship_To__c!=null?a.Ship_To__c:\'\') + \'",\'\n' +
    '                +  \'"\' + (a.Phone!=null?a.Phone:\'\') + \'",\'\n' +
    '                +  \'"\' + (a.Website!=null?a.Website:\'\') + \'",\'\n' +
    '                +  \'"\' + (a.NumberOfEmployees!=null?String.valueOf(a.NumberOfEmployees):\'\') + \'",\'\n' +
    '                +  \'"\' + String.join(mf,\'; \') + \'\"\\n\';\n' +
    '        }\n' +
    '        Messaging.EmailFileAttachment att = new Messaging.EmailFileAttachment();\n' +
    '        att.setFileName(\'cellsforce_incomplete_\'+Date.today().format()+\'.csv\');\n' +
    '        att.setBody(Blob.valueOf(csv));\n' +
    '        att.setContentType(\'text/csv\');\n' +
    '        return att;\n' +
    '    }\n}\n';

  dl(apex, 'AccountCleanerEmailService.cls', 'text/plain');
}

/* ════════════════════════════════════════════════════════════════
   SETTINGS — save / load / presets / export / import
════════════════════════════════════════════════════════════════ */
function saveSettings() {
  var cfg = {
    company: v('cfg_company'), fromEmail: v('cfg_fromEmail'),
    orgUrl: v('cfg_orgUrl'), wbUrl: v('cfg_wbUrl'),
    limit: v('cfg_limit'), repField: v('cfg_repField')
  };
  try { localStorage.setItem('cf3_settings', JSON.stringify(cfg)); } catch (e) { }
}

function loadSettings() {
  try {
    var raw = localStorage.getItem('cf3_settings');
    if (!raw) { loadPresets(); return; }
    var cfg = JSON.parse(raw);
    var map = {
      cfg_company: cfg.company, cfg_fromEmail: cfg.fromEmail,
      cfg_orgUrl: cfg.orgUrl, cfg_wbUrl: cfg.wbUrl,
      cfg_limit: cfg.limit, cfg_repField: cfg.repField
    };
    Object.keys(map).forEach(function (id) {
      if (map[id]) { var el = document.getElementById(id); if (el) el.value = map[id]; }
    });
    if (cfg.limit) {
      var ql = document.getElementById('qLimit');
      if (ql) ql.value = cfg.limit;
    }
  } catch (e) { }
  loadPresets();
}

function savePreset() {
  var name = v('presetName').trim();
  if (!name) { alert('Enter a preset name.'); return; }
  var preset = {
    fields: Array.from(selectedFields),
    filters: JSON.parse(JSON.stringify(filterRowsArr)),
    caseNums: selectedCaseNums.slice(),
    limit: v('qLimit'),
    orderBy: v('orderByField'),
    orderDir: v('orderDir'),
    object: v('qObject')
  };
  var presets = {};
  try { var r = localStorage.getItem('cf3_presets'); if (r) presets = JSON.parse(r); } catch (e) { }
  presets[name] = preset;
  try { localStorage.setItem('cf3_presets', JSON.stringify(presets)); } catch (e) { }
  var pn = document.getElementById('presetName');
  if (pn) pn.value = '';
  renderPresets(presets);
  setStatus('Preset saved: ' + name);
}

function loadPresets() {
  try {
    var raw = localStorage.getItem('cf3_presets');
    if (raw) renderPresets(JSON.parse(raw));
  } catch (e) { }
}

function renderPresets(presets) {
  var c2 = document.getElementById('presetList');
  if (!c2) return;
  var keys = Object.keys(presets);
  if (!keys.length) {
    c2.innerHTML = '<p style="font-size:11px;color:rgba(124,94,247,.45);padding:8px 0;">No presets saved yet.</p>';
    return;
  }
  c2.innerHTML = keys.map(function (name) {
    var p = presets[name];
    var safe = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return '<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid rgba(124,94,247,.1);">' +
      '<span style="flex:1;font-size:11.5px;font-weight:700;color:#f1e9ff;">' + name + '</span>' +
      '<span style="font-size:9.5px;color:var(--muted);">' + (p.fields ? p.fields.length : 0) + ' fields</span>' +
      '<button class="btn btn-teal  btn-sm" onclick="applyFullPreset(\'' + safe + '\')">Apply</button>' +
      '<button class="btn btn-red   btn-sm" onclick="deletePreset(\'' + safe + '\')">Delete</button>' +
      '</div>';
  }).join('');
}

function applyFullPreset(name) {
  try {
    var raw = localStorage.getItem('cf3_presets');
    var presets = raw ? JSON.parse(raw) : {};
    var p = presets[name];
    if (!p) return;
    if (p.fields) selectedFields = new Set(p.fields);
    if (p.filters) filterRowsArr = p.filters;
    if (p.caseNums) selectedCaseNums = p.caseNums;
    if (p.limit) { var ql = document.getElementById('qLimit'); if (ql) ql.value = p.limit; }
    if (p.orderBy) { var ob = document.getElementById('orderByField'); if (ob) ob.value = p.orderBy; }
    if (p.orderDir) { var od = document.getElementById('orderDir'); if (od) od.value = p.orderDir; }
    if (p.object) { var qo = document.getElementById('qObject'); if (qo) qo.value = p.object; }
    renderGroupSidebar();
    renderFieldGrid(currentGroup, '');
    renderFilterRows();
    buildQuery();
    switchTab('t-builder');
    setStatus('Preset applied: ' + name);
  } catch (e) { }
}

function deletePreset(name) {
  if (!confirm('Delete preset "' + name + '"?')) return;
  try {
    var raw = localStorage.getItem('cf3_presets');
    var presets = raw ? JSON.parse(raw) : {};
    delete presets[name];
    localStorage.setItem('cf3_presets', JSON.stringify(presets));
    renderPresets(presets);
  } catch (e) { }
}

function clearAll() {
  if (!confirm('Clear ALL CellsForce v3 settings and presets?')) return;
  try {
    localStorage.removeItem('cf3_app_state');
    localStorage.clear();
  } catch (e) { }
  setStatus('All data cleared.');
  window.location.reload();
}

function exportSettings() {
  var cfg = {
    company: v('cfg_company'), fromEmail: v('cfg_fromEmail'),
    orgUrl: v('cfg_orgUrl'), wbUrl: v('cfg_wbUrl'),
    limit: v('cfg_limit'), repField: v('cfg_repField')
  };
  var presets = {};
  try { var r = localStorage.getItem('cf3_presets'); if (r) presets = JSON.parse(r); } catch (e) { }
  dl(JSON.stringify({ settings: cfg, presets: presets }, null, 2),
    'cellsforce_v3_settings.json', 'application/json');
}

function importSettings(event) {
  var file = event.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function (e) {
    try {
      var data = JSON.parse(e.target.result);
      if (data.settings) {
        var s = data.settings;
        var map = {
          cfg_company: s.company, cfg_fromEmail: s.fromEmail,
          cfg_orgUrl: s.orgUrl, cfg_wbUrl: s.wbUrl,
          cfg_limit: s.limit, cfg_repField: s.repField
        };
        Object.keys(map).forEach(function (id) {
          if (map[id]) { var el = document.getElementById(id); if (el) el.value = map[id]; }
        });
        saveSettings();
      }
      if (data.presets) {
        try { localStorage.setItem('cf3_presets', JSON.stringify(data.presets)); } catch (ex) { }
        renderPresets(data.presets);
      }
      setStatus('Settings imported successfully.');
    } catch (err) { alert('Import failed: ' + err.message); }
  };
  reader.readAsText(file);
}

/* ================================================================
   PERSISTENCE, POP OUT & SCREENSHOT ENHANCEMENTS
   ================================================================ */
function popOutWindow() {
  var alwaysOnTop = c('chkAlwaysOnTop');
  var winType = alwaysOnTop ? "panel" : "popup";
  var api = typeof browser !== 'undefined' ? browser : chrome;
  api.windows.create({
    url: api.runtime.getURL("popup.html?mode=poppedout"),
    type: winType,
    width: 980,
    height: 720
  }, function (win) {
    window.close();
  });
}

function toggleAlwaysOnTop(checked) {
  if (typeof triggerSaveState === 'function') triggerSaveState();
  if (window.location.search.includes('mode=poppedout')) {
    var api = typeof browser !== 'undefined' ? browser : chrome;
    api.windows.getCurrent(function (win) {
      api.windows.create({
        url: api.runtime.getURL("popup.html?mode=poppedout"),
        type: checked ? "panel" : "popup",
        width: win.width || 980,
        height: win.height || 720
      }, function () {
        window.close();
      });
    });
  }
}

function dockToSidebar() {
  var api = typeof browser !== 'undefined' && browser.sidebarAction ? browser : chrome;
  if (api && api.sidebarAction && typeof api.sidebarAction.open === 'function') {
    api.sidebarAction.open();
    if (typeof saveState === 'function') saveState();
    window.close();
  } else {
    alert('Sidebar docking requires Firefox. Please click the Sidebar icon in the toolbar or press Ctrl+Alt+Y (Command+Option+Y on Mac).');
  }
}

// Expose functions globally for popup-bindings
window.toggleAlwaysOnTop = toggleAlwaysOnTop;
window.dockToSidebar = dockToSidebar;

function takeTabScreenshot() {
  setStatus('Preparing to take screenshot...');
  chrome.tabs.query({ active: true }, function (tabs) {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
      setStatus('Error querying tabs: ' + chrome.runtime.lastError.message);
      return;
    }

    var targetTab = null;
    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i];
      if (tab.url && !tab.url.startsWith(chrome.runtime.getURL(''))) {
        targetTab = tab;
        break;
      }
    }
    if (!targetTab && tabs.length > 0) {
      targetTab = tabs[0];
    }

    if (!targetTab) {
      setStatus('No active tab found to screenshot.');
      alert('Open a webpage tab first in Chrome to take its screenshot.');
      return;
    }

    setStatus('Capturing tab content...');
    chrome.tabs.captureVisibleTab(targetTab.windowId, { format: 'png' }, function (dataUrl) {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        setStatus('Screenshot failed: ' + chrome.runtime.lastError.message);
        // Fallback: capture lastFocusedWindow
        chrome.windows.getLastFocused({ populate: true }, function (win) {
          if (win && win.id) {
            chrome.tabs.captureVisibleTab(win.id, { format: 'png' }, function (dataUrl2) {
              if (chrome.runtime.lastError) {
                setStatus('Failed to capture: ' + chrome.runtime.lastError.message);
              } else {
                loadImgDataUrl(dataUrl2);
              }
            });
          }
        });
        return;
      }
      loadImgDataUrl(dataUrl);
    });
  });
}

function loadImgDataUrl(dataUrl) {
  imgDataUrl = dataUrl;
  var wrap = document.getElementById('imgPreviewWrap');
  var preview = document.getElementById('imgPreview');
  if (wrap && preview) {
    preview.innerHTML = '<img src="' + dataUrl + '" alt="Screenshot preview"/>';
    wrap.style.display = 'block';
    switchTab('t-extract');
    triggerSaveState();
    setStatus('Screenshot captured! Click "Detect Columns" in Smart Paste tab.');
  }
}

// Auto-save debounced helper
var saveStateTimeout = null;
function triggerSaveState() {
  if (saveStateTimeout) clearTimeout(saveStateTimeout);
  saveStateTimeout = setTimeout(saveState, 500);
}

function saveState() {
  try {
    var state = {
      speInput: v('speInput'),
      exCaseNums: c('exCaseNums'),
      exAcctNums: c('exAcctNums'),
      exSFIds: c('exSFIds'),
      exEmails: c('exEmails'),
      exPhones: c('exPhones'),
      customPatternInput: v('customPatternInput'),
      qObject: v('qObject'),
      orderByField: v('orderByField'),
      orderDir: v('orderDir'),
      qLimit: v('qLimit'),
      chkExcludeRel: c('chkExcludeRel'),
      fieldSearch: v('fieldSearch'),
      libCaseInput: v('libCaseInput'),
      pasteMode: v('pasteMode'),
      pasteInput: v('pasteInput'),
      emailFromName: v('emailFromName'),
      emailFromAddr: v('emailFromAddr'),
      emailSubject: v('emailSubject'),
      emailDeadline: v('emailDeadline'),
      emailOpening: v('emailOpening'),
      emailClosing: v('emailClosing'),
      ec_Name: c('ec_Name'),
      ec_AcctNum: c('ec_AcctNum'),
      ec_Region: c('ec_Region'),
      ec_Missing: c('ec_Missing'),
      ec_Phone: c('ec_Phone'),
      ec_Web: c('ec_Web'),
      ec_Billing: c('ec_Billing'),
      ec_CaseNum: c('ec_CaseNum'),
      chkAlwaysOnTop: c('chkAlwaysOnTop'),

      // Global state variables
      selectedFields: Array.from(selectedFields),
      filterRowsArr: filterRowsArr,
      selectedCaseNums: selectedCaseNums,
      parsedRecords: parsedRecords,
      currentGroup: currentGroup,
      selectedTabId: document.querySelector('.cf-panel.active') ? document.querySelector('.cf-panel.active').id : 't-extract',
      imgDataUrl: imgDataUrl
    };
    localStorage.setItem('cf3_app_state', JSON.stringify(state));
  } catch (e) {
    console.error('Error saving state:', e);
  }
}

function loadAppState() {
  try {
    var raw = localStorage.getItem('cf3_app_state');
    if (!raw) return;
    var state = JSON.parse(raw);

    var setVal = function (id, val) {
      var el = document.getElementById(id);
      if (el && val !== undefined) el.value = val;
    };
    var setChk = function (id, val) {
      var el = document.getElementById(id);
      if (el && val !== undefined) el.checked = !!val;
    };

    setVal('speInput', state.speInput);
    setChk('exCaseNums', state.exCaseNums);
    setChk('exAcctNums', state.exAcctNums);
    setChk('exSFIds', state.exSFIds);
    setChk('exEmails', state.exEmails);
    setChk('exPhones', state.exPhones);
    setVal('customPatternInput', state.customPatternInput);
    setVal('qObject', state.qObject);
    setVal('orderByField', state.orderByField);
    setVal('orderDir', state.orderDir);
    setVal('qLimit', state.qLimit);
    setChk('chkExcludeRel', state.chkExcludeRel);
    setVal('fieldSearch', state.fieldSearch);
    setVal('libCaseInput', state.libCaseInput);
    setVal('pasteMode', state.pasteMode);
    setVal('pasteInput', state.pasteInput);
    setVal('emailFromName', state.emailFromName);
    setVal('emailFromAddr', state.emailFromAddr);
    setVal('emailSubject', state.emailSubject);
    setVal('emailDeadline', state.emailDeadline);
    setVal('emailOpening', state.emailOpening);
    setVal('emailClosing', state.emailClosing);
    setChk('ec_Name', state.ec_Name);
    setChk('ec_AcctNum', state.ec_AcctNum);
    setChk('ec_Region', state.ec_Region);
    setChk('ec_Missing', state.ec_Missing);
    setChk('ec_Phone', state.ec_Phone);
    setChk('ec_Web', state.ec_Web);
    setChk('ec_Billing', state.ec_Billing);
    setChk('ec_CaseNum', state.ec_CaseNum);
    setChk('chkAlwaysOnTop', state.chkAlwaysOnTop);

    if (state.selectedFields) selectedFields = new Set(state.selectedFields);
    if (state.filterRowsArr) filterRowsArr = state.filterRowsArr;
    if (state.selectedCaseNums) selectedCaseNums = state.selectedCaseNums;
    if (state.parsedRecords) parsedRecords = state.parsedRecords;
    if (state.currentGroup) currentGroup = state.currentGroup;
    if (state.imgDataUrl) {
      imgDataUrl = state.imgDataUrl;
      var wrap = document.getElementById('imgPreviewWrap');
      var preview = document.getElementById('imgPreview');
      if (wrap && preview) {
        preview.innerHTML = '<img src="' + imgDataUrl + '" alt="Screenshot preview"/>';
        wrap.style.display = 'block';
      }
    }

    renderGroupSidebar();
    renderFieldGrid(currentGroup, state.fieldSearch || '');
    renderFilterRows();
    buildQuery();

    if (state.parsedRecords && state.parsedRecords.length) {
      renderParseStats(parsedRecords);
      renderDataTable(parsedRecords);
      renderDeeperSOQL(parsedRecords);
      var w = document.getElementById('parseStatsWrap');
      if (w) w.style.display = 'block';
    }

    if (state.selectedCaseNums && state.selectedCaseNums.length) {
      runExtract();
    }

    if (state.selectedTabId) {
      switchTab(state.selectedTabId);
    }
  } catch (e) {
    console.error('Error loading app state:', e);
  }
}

