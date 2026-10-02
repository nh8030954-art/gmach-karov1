(()=>{"use strict";
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function api(path,opts={}){const init={credentials:"same-origin",...opts,headers:{...(opts.headers||{})}};if(opts.body&&!(opts.body instanceof FormData)){init.headers["Content-Type"]="application/json";init.body=JSON.stringify(opts.body)}let r;try{r=await fetch(path,init)}catch(e){throw new Error(window.GmachDescribeNetworkError?window.GmachDescribeNetworkError(e):"לא ניתן להתחבר לשרת")}const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(window.GmachDescribeHttpError?window.GmachDescribeHttpError(r,d):(d.error||"הפעולה לא הושלמה"));return d}
function toast(m,e=false){if(window.GmachToast)return window.GmachToast(m,e?"error":"success");}
const I18N={
"he":{},
"en":{
"גמ״ח ברגע":"Gmach Berega","חיפוש":"Search","חיפוש מוצרים":"Search items","כל הקטגוריות":"All categories","כל הערים":"All cities",
"זמין עכשיו":"Available now","זמין לבקשה":"Available to request","יש לתאם תאריך":"Coordinate dates","בקשת השאלה חינמית":"Request a free loan",
"עמוד הגמ״ח":"Gmach page","שיתוף":"Share","דיווח על פריט או מידע לא נכון":"Report item or incorrect information","מיקום איסוף":"Pickup area","כמות זמינה":"Available quantity","דירוג הפריט":"Item rating","זמינות":"Availability",
"אזור אישי":"My account","הגדרות וניהול":"Settings & management","פרופיל":"Profile","כתובות":"Addresses","מכשירים":"Devices","התראות":"Notifications","חיפושים שמורים":"Saved searches","תמיכה":"Support","ניהול־על":"Admin",
"שם מלא":"Full name","טלפון":"Phone","עיר/יישוב":"City / locality","שפה":"Language","שמירה":"Save","מחיקה":"Delete","עריכה":"Edit","סגירה":"Close",
"פתיחת גמ״ח":"Open a gmach","אשף פתיחת גמ״ח":"Gmach setup wizard","הוספת מוצר":"Add item","פרסום הפריט":"Publish item","תמונת הפריט":"Item images",
"איך הייתה ההשאלה?":"How was the loan?","דירוג הגמ״ח":"Gmach rating","ביקורת":"Review","פרסום הדירוגים":"Publish ratings",
"בקשות קהילה":"Community requests","פרסום הבקשה":"Publish request","הבקשה דחופה":"Urgent request","בקשת עזרה מהקהילה":"Community help request",
"איסוף עצמי":"Pickup","משלוח":"Delivery","בתיאום":"By arrangement","שעות פעילות":"Opening hours","אזור שירות":"Service area",
"עברית":"Hebrew","הוספת כתובת":"Add address","כתובות שמורות":"Saved addresses","ניתוק המכשיר":"Sign out device","שמירת העדפות":"Save preferences",
"הפניות שלי":"My support tickets","אין פניות קודמות. ניתן לפתוח פנייה דרך \"צור קשר\".":"No previous tickets. You can open one from Contact.",
"קטגוריות":"Categories","סגירות מערכת":"Platform closures","אירועי אבטחה":"Security events","תזמון סגירה":"Schedule closure",
"לוח זמינות":"Availability calendar","מוצרים דומים":"Similar nearby items","זמינות קרובה":"Next availability","דוח תפעולי":"Operations dashboard",
"ניהול תמונות":"Manage images","תמונה ראשית":"Primary image","סיבוב":"Rotate","חיתוך ריבועי":"Square crop","טשטוש מרכז":"Blur center","הזזה למעלה":"Move up","הזזה למטה":"Move down",
"אנגלית":"English","החלף שפה":"Switch language","גיבויים":"Backups","בדיקת שחזור":"Restore validation","CMS ותוכן":"CMS & content",
"מועדפים ובקשות קבועות":"Saved items & recurring requests","קטגוריות שמורות":"Saved categories","שמירת קטגוריה":"Save category","הסרה מהשמורים":"Remove saved","כל המועדפים":"All saved items","בקשות מחזוריות":"Recurring requests","אין בקשות מחזוריות.":"No recurring requests.","אין מועדפים נוספים.":"No additional saved items.","התראות פעילות":"Notifications enabled","ללא התראות":"Notifications off","ביטול":"Cancel","הסרה":"Remove","פעיל":"Active","כבוי":"Disabled","הפעלה":"Enable","השבתה":"Disable","תפעול מתקדם":"Advanced operations","השאלות":"Loans","הושלמו":"Completed","בוטלו":"Cancelled","איחורים":"Late","פעילים 30 יום":"Active in 30 days","תבניות אימייל":"Email templates","חגים":"Holidays","יצירת גיבוי לוגי עכשיו":"Create logical backup now","שמירת תבנית":"Save template","נבדק":"Reviewed","הסתרה":"Hide","סינון לפי פעולה":"Filter by action","ייצוא CSV":"Export CSV","שם בעברית":"Hebrew name","מזהה קטגוריית אב":"Parent category ID","אייקון":"Icon","כתובת תמונה":"Image URL","מילים נרדפות, מופרדות בפסיק":"Synonyms, comma separated","הוספת קטגוריה":"Add category","קטגוריית אב":"Parent category","פעילה":"Active","מוסתרת":"Hidden","שמירת קטגוריה":"Save category","תחזוקה":"Maintenance","ידני":"Manual","חג":"Holiday","כותרת":"Title","תזמון סגירה":"Schedule closure","מרכז הגדרות וניהול":"Settings and management center","חשבון, פרטיות, מכשירים וכלי ניהול":"Account, privacy, devices and management tools","הודעות תפעוליות":"Operational emails","עדכוני קהילה":"Community updates","כתובת ברירת מחדל":"Default address","הגדרה כברירת מחדל":"Set as default","אין חיפושים שמורים.":"No saved searches.","שמירת חיפוש":"Save search","שם לחיפוש":"Search name","מילות חיפוש":"Search terms","להודיע על תוצאות חדשות":"Notify about new results","הצגת תוצאות":"Show results","שמירת שינויים":"Save changes","שעות שקטות":"Quiet hours","עד":"Until","אימייל":"Email","סיכום יומי":"Daily digest","מיידי":"Immediate","אבטחה":"Security","קהילה":"Community","השאלות":"Loans","הודעות":"Messages","רשימת המתנה":"Waitlist"
}};
const I18N_EXTRA={
"אירועים":"Events","אירוע":"Event","שמחה":"Celebration","חתונה":"Wedding","בר מצווה":"Bar mitzvah","בת מצווה":"Bat mitzvah","ברית":"Brit milah","קישוט":"Decoration","קישוטים":"Decorations","עיצוב":"Design","דקורציה":"Decor","שולחן":"Table","כיסאות":"Chairs","תאורה":"Lighting","הגברה":"Sound equipment","כלי עבודה":"Tools","כלים":"Tools","תיקון":"Repair","שיפוץ":"Renovation","מקדחה":"Drill","מברגה":"Driver","פטישון":"Rotary hammer","סולם":"Ladder","מסור":"Saw","ארגז כלים":"Toolbox","תינוקות":"Babies","תינוק":"Baby","ילדים":"Children","עגלה":"Stroller","עגלת תינוק":"Baby stroller","טיולון":"Stroller","עריסה":"Cradle","לול":"Playpen","מיטת תינוק":"Crib","כיסא אוכל":"High chair","כסא אוכל":"High chair","סלקל":"Infant car seat","רפואה":"Medical","רפואי":"Medical","שיקום":"Rehabilitation","נגישות":"Accessibility","כיסא גלגלים":"Wheelchair","כסא גלגלים":"Wheelchair","כיסא נכים":"Wheelchair","הליכון":"Walker","רולטור":"Rollator","קביים":"Crutches","מיטה סיעודית":"Care bed","טיולים":"Travel","טיול":"Travel","קמפינג":"Camping","מחנאות":"Camping","אוהל":"Tent","צידנית":"Cooler","תרמיל":"Backpack","מזרן שטח":"Camping mat","שק שינה":"Sleeping bag","בית ואירוח":"Home & hosting","בית":"Home","אירוח":"Hosting","אורחים":"Guests","מזרן":"Mattress","מזרנים":"Mattresses","שולחן מתקפל":"Folding table","כיסא מתקפל":"Folding chair","כלי אוכל":"Tableware","פלטה":"Hot plate","מיחם":"Hot water urn","תחפושות":"Costumes","תחפושת":"Costume","פורים":"Purim","בגד":"Clothing","ספרים":"Books","ספר":"Book","לימוד":"Study","קודש":"Religious books",
"ממתינה לאישור":"Pending approval","אושרה":"Approved","נדחתה":"Declined","בוטלה":"Cancelled","נאסף":"Collected","הוחזר":"Returned","נדחה":"Declined","בארכיון":"Archived","זמין":"Available","לא זמין":"Unavailable","שולח…":"Sending...","הפעולה לא הושלמה":"Action could not be completed","השרת מתעכב. אפשר להמשיך לעיין ולנסות שוב בעוד רגע.":"The server is taking longer than expected. You can keep browsing and try again shortly.","חדש — ללא דירוגים":"New - no ratings yet","לא הצלחנו לטעון את הפריטים":"We could not load the items","כדאי לרענן את הדף בעוד רגע.":"Please refresh the page shortly.","שגיאה בטעינת הקטלוג":"Catalog loading error","הסרה מהמועדפים":"Remove from saved","הוספה למועדפים":"Save item","גמ״ח":"Gmach","היום":"Today","אתמול":"Yesterday","פרטים":"Details","הקטלוג אינו זמין כרגע":"The catalog is currently unavailable","לא הצלחנו להתחבר כרגע":"We could not connect right now","נסו לרענן את הדף בעוד רגע.":"Please refresh the page shortly.","ניסיון נוסף":"Try again","הקטלוג נבנה יחד עם הקהילה":"The catalog grows with the community","מנהלים גמ״ח או מחזיקים ציוד שאפשר להשאיל? פרסמו אותו בחינם ועזרו למשפחה הבאה.":"Run a gmach or have equipment to lend? List it for free and help the next family.","פרסום גמ״ח בחינם":"List a gmach for free","אין כרגע תוצאות שמתאימות לסינון":"No results match these filters","לא מצאנו פריט מתאים כרגע":"We could not find a matching item","נסו להרחיב את האזור או לבחור קטגוריה אחרת.":"Try expanding the area or selecting another category.","ניקוי החיפוש":"Clear search","אפשר להשוות עד חמישה פריטים":"You can compare up to five items","השוואת פריטים":"Compare items","קטגוריה":"Category","מצב":"Condition","עיר":"City","תנאי השאלה":"Loan terms","סגירת השוואה":"Close comparison","לא צוין":"Not specified","זמין בתיאום":"Available by arrangement","טרם דורג":"Not rated yet","גמ״ח חדש ללא דירוגים":"New gmach with no ratings yet","תמונה":"Image","הקישור הועתק":"Link copied","עדיין אין דירוגים":"No ratings yet","פעילות טרם עודכנה":"Activity has not been updated yet","בתיאום מראש":"By prior arrangement","אין כרגע פריטים פעילים":"No active items right now","ללא הערה":"No comment","תודה על המשוב":"Thank you for the feedback","מה הבעיה בביקורת?":"What is the issue with this review?","הדיווח נשלח לבדיקה":"The report was submitted for review","בחרו תאריך ושעה כדי לבדוק זמינות.":"Choose a date and time to check availability.","בודקים זמינות…":"Checking availability...","לא זמין בטווח שבחרתם.":"Unavailable for the selected period.","לא ניתן לבדוק זמינות כרגע.":"Availability cannot be checked right now.","הפריט הוסר מהמועדפים":"Item removed from saved items","הפריט נוסף למועדפים":"Item saved","מצטרפים לגמ״ח ברגע":"Join Gmach Berega","כניסה לגמ״ח ברגע":"Sign in to Gmach Berega","יוצרים חשבון בחינם ומתחילים להשאיל ולעזור.":"Create a free account and start borrowing and helping.","נכנסים עם אימייל וסיסמה כדי לבקש, לשמור ולנהל פריטים.":"Sign in with email and password to request, save and manage items.","יצירת חשבון":"Create account","כניסה":"Sign in","האזור שלי":"My account","חבר/ה":"Member","לא הצלחנו לטעון התראות":"We could not load notifications","יש להתחבר לפני שליחת בקשה":"Please sign in before submitting a request","עריכת עמוד הגמ״ח":"Edit gmach page","פתיחת עמוד גמ״ח":"Create gmach page","שינוי בפרטים הציבוריים יישלח לבדיקה חוזרת כדי לשמור על אמינות הקטלוג.":"Changes to public details will be sent for review to protect catalog quality.","ממלאים פרטים בסיסיים. העמוד יפורסם לאחר בדיקה קצרה.":"Enter the basic details. The page will be published after a short review.","שליחה לבדיקה":"Submit for review","שעות":"Hours","כדי לפרסם פריט, פותחים קודם עמוד גמ״ח":"Create a gmach page before listing an item","שכפול פריט":"Duplicate item","עריכת פריט":"Edit item","מה תרצו להשאיל?":"What would you like to lend?","מצב טוב":"Good condition","הפרטים הועתקו לטופס חדש. בדקו כמות וצרפו תמונות לפני הפרסום.":"The details were copied to a new form. Check the quantity and add images before publishing.","לא הצלחנו לטעון את הגמ״חים שלך":"We could not load your gmachs","אפשר להעלות עד 12 תמונות":"You can upload up to 12 images","כל תמונה יכולה להיות עד 5MB":"Each image can be up to 5 MB","אפשר להעלות JPG, PNG או WebP בלבד":"Only JPG, PNG or WebP images are supported","לא הצלחנו לטעון את האזור האישי":"We could not load your account","המכשיר הזה":"This device","ניתוק":"Sign out","לא נמצאו מכשירים מחוברים.":"No connected devices found.","לנתק את המכשיר הזה?":"Sign out this device?","המכשיר נותק":"Device signed out","הכתובת עודכנה":"Address updated","ברירת מחדל":"Default","הכתובת נשמרה":"Address saved","למחוק את הכתובת?":"Delete this address?","החיפוש נשמר":"Search saved","הפרטים שלי":"My details","בקשת המחיקה בוטלה":"Deletion request cancelled","עדכוני השאלה":"Loan updates","הודעות בשיחות":"Chat messages","תזכורות":"Reminders","העדפות התראות":"Notification preferences","ההעדפות נשמרו":"Preferences saved","שיחה":"Chat","הוספה ליומן":"Add to calendar",
"מה דורש תשומת לב":"Needs your attention","הפעולות הקרובות והחשובות ביותר.":"Your most important upcoming actions.","אין":"None","אין השאלה קרובה":"No upcoming loan","פריטים שממתינים להחזרה":"Items awaiting return","בקשות שממתינות לפעולה שלך":"Requests waiting for your action","בקשות קהילה פתוחות":"Open community requests","בקשה ששלחתי":"Request I sent","הודעת מנהל:":"Manager note:","טלפון הגמ״ח:":"Gmach phone:","עוד אין כאן בקשות":"No requests here yet","כשתבקשו פריט או תקבלו בקשה לגמ״ח שלכם, היא תופיע כאן.":"Your requests and incoming gmach requests will appear here.","אישור":"Approve","דחייה":"Decline","תיאום וציר זמן":"Scheduling & timeline","שינוי בקשה":"Change request","ביטול בקשה":"Cancel request","ביטול הביטול":"Undo cancellation","בקשת הארכה":"Request extension","אישור הארכה":"Approve extension","הצעת מועד חלופי":"Suggest another date","דחיית הארכה":"Decline extension","אישור שינוי":"Approve change","דחיית שינוי":"Decline change","כתיבת ביקורת":"Write review","מסך איסוף":"Pickup screen","מסך החזרה":"Return screen","הקצאת יחידות בזמן האיסוף":"Assign units at pickup","סמן כנאסף":"Mark collected","החזרת הפריט":"Item return","אישור החזרה וסיום":"Confirm return and complete","ציר זמן":"Timeline","הצעות איסוף":"Pickup proposals","הצעת חלון איסוף":"Suggest pickup window","הצעה נגדית":"Counter proposal","אין אירועים עדיין.":"No events yet.","עדיין לא הוצע חלון איסוף.":"No pickup window has been proposed yet.","בקשת השינוי נשלחה לאישור":"Change request submitted for approval","בקשת ההארכה נשלחה":"Extension request submitted"
};Object.assign(I18N.en,I18N_EXTRA);
Object.assign(I18N.en,{
"הבקשות, הפריטים והגמ״חים שלך במקום אחד.":"Your requests, items and gmachs in one place.",
"החשבון שלי":"My account",
"כלים נוספים":"More tools",
"שמורים":"Saved",
"(מוצגת לציבור בעמוד הגמ״ח)":"(shown publicly on the gmach page)",
"לא ניתן להגדיר שעות פעילות מיום שישי בשעה 17:00 ועד שבת בשעה 20:00.":"Opening hours cannot be set from Friday 17:00 until Saturday 20:00.",
"תיאור קצר של הפריט":"Short item description",
"הגדרות נוספות":"Additional settings",
"לא חובה · ברירת מחדל: השאלה, שעה עד 7 ימים, אישור מנהל וללא פיקדון":"Optional · Default: loan, 1 hour to 7 days, manager approval, no deposit",
"נדרש פיקדון להבטחת החזרת המוצר כפי שנלקח.":"A deposit is required to help ensure the item is returned in the condition received.",
"פתיחת החשבון שלי":"Open my account",
"סיכום פעילות":"Activity summary",
"מה הפריט, מה מצבו ומה חשוב לדעת לפני שמבקשים":"What the item is, its condition, and what borrowers should know",
"למשל: החזרה נקייה ובזמן":"For example: return clean and on time"
});
Object.assign(I18N.en,{
"העברות בעלות":"Ownership transfers","פרטיות ונתונים":"Privacy & data","יומן":"Calendar","קטגוריות שמורות":"Saved categories","טוענים…":"Loading...","המסך זמין להנהלת האתר בלבד.":"This screen is available to site administrators only.","ביטול בקשת מחיקה":"Cancel deletion request","הפרטים נשמרו.":"Details saved.","הזמנות שקיבלת":"Invitations received","קבלת בעלות":"Accept ownership","אין הזמנות ממתינות.":"No pending invitations.","העברות ששלחת":"Transfers sent","אין העברות שנשלחו.":"No transfers sent.","הבעלות הועברה לחשבון שלך.":"Ownership was transferred to your account.","ההזמנה נדחתה.":"Invitation declined.","הנתונים שלי":"My data","אפשר לייצא עותק של הנתונים האישיים או לפתוח בקשת עיון ותיקון.":"Export a copy of your personal data or submit an access or correction request.","ייצוא הנתונים שלי":"Export my data","בקשת עיון":"Access request","בקשת תיקון":"Correction request","מחיקת חשבון":"Delete account","בקשת מחיקת חשבון":"Request account deletion","הייצוא נכשל":"Export failed","קובץ הנתונים נוצר.":"Your data file was created.","הבקשה נשלחה ותופיע במערכת התמיכה.":"The request was submitted and will appear in support.","כתובות שמורות":"Saved addresses","למשל: בית":"For example: Home","כתובת מלאה":"Full address","עדיין אין כתובות שמורות.":"No saved addresses yet.","שמירת שינויים":"Save changes","הכתובת השמורה אינה מוצגת מטעמי פרטיות":"The saved address is hidden for privacy","כתובת ברירת המחדל עודכנה.":"Default address updated.","הכתובת נמחקה.":"Address deleted.","מכשיר":"Device","המכשיר הנוכחי":"Current device","ניתוק המכשיר":"Sign out device","שעות שקטות":"Quiet hours","שמירת העדפות":"Save preferences","באתר":"In app","מיידי":"Immediate","סיכום יומי":"Daily digest","העדפות ההתראות נשמרו.":"Notification preferences saved.","יומן ותזכורות":"Calendar & reminders","אפליקציית יומן מועדפת":"Preferred calendar app","קובץ יומן (ICS)":"Calendar file (ICS)","תזכורת לפני האירוע":"Reminder before event","שעה":"hour","שבוע":"week","שמירת העדפות יומן":"Save calendar preferences","העדפות היומן נשמרו.":"Calendar preferences saved.","שמירת חיפוש":"Save search","שם לחיפוש":"Search name","מילות חיפוש":"Search terms","להודיע על תוצאות חדשות":"Notify me about new results","אין חיפושים שמורים.":"No saved searches.","הצגת תוצאות":"Show results","החיפוש אינו זמין כרגע.":"Search is currently unavailable.","בחרו קטגוריות שתרצו למצוא בקלות.":"Choose categories you want quick access to.","הקטגוריה הוסרה.":"Category removed.","הקטגוריה נשמרה.":"Category saved.","אין קטגוריות זמינות כרגע.":"No categories are currently available.","הפניות שלי":"My support tickets",
"ברוכים הבאים":"Welcome","מכאן אפשר לחפש מוצר, לבקש מהקהילה, לעקוב אחר השאלות ולפתוח גמ״ח.":"Search for items, ask the community, track loans and open a gmach.","חיפוש והשאלה":"Search & borrow","האזור האישי":"My account","ניהול גמ״ח":"Manage a gmach","דלג ואל תציג שוב":"Skip and do not show again","הקודם":"Back","סיום":"Finish","הבא":"Next","זהות הגמ״ח":"Gmach identity","שם הגמ״ח *":"Gmach name *","סוג הגוף *":"Organization type *","אדם פרטי":"Private individual","משפחה":"Family","קהילה / בית כנסת":"Community / synagogue","עמותה":"Nonprofit","עסק שמשאיל בחינם":"Business lending for free","רשות / מוסד":"Public body / institution","אזור ויצירת קשר":"Area & contact","עיר *":"City *","כתובת *":"Address *","טלפון *":"Phone *","תיאור ופעילות":"Description & activity","תיאור *":"Description *","קטגוריה ראשית *":"Primary category *","קטגוריות נוספות, מופרדות בפסיק":"Additional categories, comma separated","שמירת טיוטה":"Save draft","יצירת הגמ״ח":"Create gmach","הטיוטה נשמרה":"Draft saved","הפעלת התראות Push":"Enable push notifications","לא ניתנה הרשאת התראות":"Notification permission was not granted","התראות Push הופעלו":"Push notifications enabled","סריקת יחידה":"Scan unit","דיווח תקלה":"Report issue","תיאור התקלה:":"Issue description:","סטטוס היחידה עודכן":"Unit status updated","קול":"Voice","מיקום":"Location","כרטיס מוצר":"Item card","לא נמצא מזהה השאלה":"Loan request ID not found","המיקום נשלח":"Location sent","לא ניתנה הרשאת מיקום":"Location permission was not granted","מזהה המוצר לשיתוף:":"Item ID to share:","הקובץ נשלח":"File sent","מוצר":"Item","בקשת קהילה":"Community request","הצעות פעילות מרשימת המתנה":"Active waitlist offers","קבלת ההצעה":"Accept offer","ויתור":"Decline","אין הצעה פעילה כרגע.":"No active offer right now.","שמירת תוכן נוסף":"Save more content","סוג":"Type","מזהה או ערך":"ID or value","לקבל התראות":"Receive notifications","מזהה מוצר":"Item ID","כמות":"Quantity","מועד ראשון":"First date","משך בדקות":"Duration in minutes","תדירות":"Frequency","שבועי":"Weekly","דו שבועי":"Every two weeks","חודשי":"Monthly","מספר מופעים":"Number of occurrences","יצירת בקשה מחזורית":"Create recurring request","ההצעה התקבלה ונוצרה בקשת השאלה":"Offer accepted and a loan request was created","ויתרת על ההצעה":"You declined the offer","התוכן נשמר במועדפים":"Content saved","הבקשה המחזורית נוצרה":"Recurring request created","המועדף הוסר":"Saved item removed","הבקשה המחזורית בוטלה":"Recurring request cancelled","יצירת גיבוי לוגי עכשיו":"Create logical backup now","גיבויים רשומים":"Recorded backups","נושא":"Subject","תוכן":"Content","שמירת תבנית":"Save template"
});
Object.assign(I18N.en,{"חיפושים שמורים":"Saved searches","עריכה":"Edit","מחיקה":"Delete","שם החיפוש":"Search name","שמירת הסינון הנוכחי":"Save current filters","החיפוש השמור עודכן":"Saved search updated","לקבל התראה כשנוסף פריט מתאים?":"Notify me when a matching item is added?","מכשירים מחוברים":"Connected devices","אפשר לנתק מכשיר שאינכם מזהים. המכשיר הנוכחי יישאר מחובר.":"You can sign out a device you do not recognize. Your current device will remain signed in.","פעילות אחרונה:":"Last activity:","חובר:":"Connected:","תפוגה:":"Expires:","אירועי אבטחה אחרונים":"Recent security events","אין אירועי אבטחה להצגה.":"No security events to display.","באימייל":"Email","תדירות":"Frequency","שקט מ":"Quiet from","עד":"Until","רשימת המתנה":"Waitlist","בקשות קהילה":"Community requests","סניפים ומנהלים":"Branches & managers","מנהלים והרשאות":"Managers & permissions","הזמנת מנהל חדש":"Invite a new manager","הודעה אישית":"Personal message","יצירת קישור הזמנה ל-7 ימים":"Create 7-day invitation link","אין הזמנות פעילות.":"No active invitations.","ביטול":"Cancel","קישור ההזמנה הועתק. הוא בתוקף ל-7 ימים.":"Invitation link copied. It is valid for 7 days.","ההזמנה בוטלה":"Invitation cancelled","עריכת הודעה":"Edit message","מחיקת הודעה":"Delete message","נקרא":"Read","פתיחת קובץ מצורף":"Open attachment","השיחה מתחילה כאן":"The conversation starts here","כתבו הודעה לתיאום האיסוף, ההחזרה או שינוי התאריכים.":"Write a message to coordinate pickup, return or date changes.","דיווח":"Report","חסימה":"Block","תיאום ההשאלה":"Loan coordination","אני":"Me","עריכת כתובת":"Edit address","כתובת מלאה חדשה":"New full address","קביעה כברירת מחדל":"Set as default","כתובות פרטיות":"Private addresses","הכתובת המלאה שמורה באופן מוצפן ואינה מוצגת ברשימה.":"The full address is encrypted and is not shown in the list.","הוספת כתובת":"Add address","עיר או יישוב":"City or locality","שמירת כתובת":"Save address"});
Object.assign(I18N.en,{
"גמ״ח קהילתי":"Community gmach","למשל: ציוד לתינוק בתל אביב":"For example: baby equipment in Tel Aviv","הפרטים נשמרו":"Details saved","פריט":"Item","שואל/ת":"Borrower","האיסוף הושלם והיחידות הוקצו":"Pickup completed and units assigned","ההשאלה הושלמה. נשלחה לשואל אפשרות לדרג וליצור בקשה נוספת.":"Loan completed. The borrower can now review and create another request.","השאלה קרובה":"Upcoming loan","כללי":"General","פתוחה":"Open","הבקשה שוחזרה":"Request restored","השינוי אושר":"Change approved","השינוי נדחה":"Change declined","ההארכה אושרה":"Extension approved","ההארכה נדחתה":"Extension declined","המועד החלופי נשלח":"Alternative date sent","הודעה לבעל הבקשה:":"Message to requester:","מצאתי מוצר שיכול להתאים לבקשה שלך.":"I found an item that may match your request.","ההצעה נשלחה":"Offer sent","מציע":"Offerer","ללא מוצר מקושר":"No linked item","הצעות לבקשת הקהילה":"Community request offers","בחירת ההצעה":"Select offer","המלאי נשמר":"Inventory reserved","ממתין לאישור":"Pending approval","הוצע זמן איסוף":"Pickup time proposed","אושר ומוכן לאיסוף":"Approved and ready for pickup","ממתין להחזרה":"Awaiting return","הארכה ממתינה":"Extension pending","באיחור":"Overdue","הוחזר והושלם":"Returned and completed","בוטל":"Cancelled","זמן האיסוף אושר":"Pickup time approved","הגמ״ח שלי":"My gmach","סימון כלא זמין":"Mark unavailable","סימון כזמין":"Mark available","החזרה לבדיקה":"Return for review","המוצר הוסר":"Item removed","מצוין":"Excellent","סטטוס היחידה נשמר":"Unit status saved","אין אירועים":"No events","חסימות פעילות":"Active blocks","חסימת מלאי":"Inventory block","יחידות":"units","מוסתר מהקטלוג":"Hidden from catalog","מוצג לציבור":"Visible publicly","הצגה מחדש":"Show again","הסתרת הגמ״ח":"Hide gmach","בחרו לפחות מוצר אחד":"Select at least one item","מוצרים":"items","נמצאו":"found","נוצרו":"created","שגיאות":"errors","ללא סניף":"No branch","הגמ״ח נסגר זמנית":"Gmach temporarily closed","הגמ״ח נפתח מחדש":"Gmach reopened","שם הגמ״ח לא תאם":"Gmach name did not match","העברת המלאי נפתחה":"Inventory transfer created","העברת המלאי התקבלה":"Inventory transfer received","אימות אנושי":"Human verification","מרכז הגדרות וניהול":"Settings & management center","כל הפריטים":"All items","מילים נרדפות":"Synonyms","כבויה":"Disabled","הפעולה נכשלה":"Action failed","הגמ״ח נוצר. השלב הבא: הוספת מוצר ראשון כדי לפרסם אותו בחיפוש.":"Gmach created. Next, add the first item so it can appear in search.","הגיבוי נוצר":"Backup created","תבנית האימייל נשמרה":"Email template saved","הגדרת החג עודכנה":"Holiday setting updated","פעולת האכיפה נשמרה":"Enforcement action saved","זמינים":"available","בקשות חדשות":"New requests","איסופים היום":"Pickups today","החזרות היום":"Returns today","הודעות לא נקראו":"Unread messages","דירוגים 30 יום":"Ratings - 30 days","התוכן נשמר":"Content saved","דיווחים ואכיפה":"Reports & enforcement","הדיווח טופל":"Report resolved","רשומות":"records","סטטוס שירותים":"Service status","מוגדר":"Configured","חסר":"Missing","מפה ומיקום":"Map & location","כתובת לחיפוש":"Address to search","עיר, רחוב ומספר":"City, street and number","מפה":"Map","יעד":"Destination","הכתובת הועתקה":"Address copied","מחפשים…":"Searching...","לא נמצאה כתובת.":"Address not found.","המיקום הנוכחי":"Current location","לא התקבלה הרשאת מיקום":"Location permission was not granted","הקטגוריות נשמרו":"Categories saved"
});
Object.assign(I18N.en,{"פעולות מלאי":"Inventory actions","כלים מתקדמים":"Advanced tools","עוד אין לכם עמוד גמ״ח":"You do not have a gmach page yet","הפתיחה חינמית ולוקחת כמה דקות.":"Creating one is free and takes a few minutes.","פתיחת גמ״ח":"Create a gmach","פעולות מלאי קבוצתיות":"Bulk inventory actions","פעולה":"Action","הפעלה":"Activate","השבתה":"Deactivate","שינוי זמינות":"Change availability","שינוי כמות":"Change quantity","שינוי קטגוריה":"Change category","ערך":"Value","ביצוע על המוצרים שנבחרו":"Apply to selected items","ייבוא מוצרים":"Import items","בדיקה וייבוא":"Validate & import","סניפים":"Branches","שם":"Name","מודל מלאי":"Inventory model","נפרד":"Separate","משותף":"Shared","משולב":"Hybrid","הוספת סניף":"Add branch","פתיחה מחדש":"Reopens at","סגירה זמנית":"Temporarily close","פתיחה עכשיו":"Reopen now","ארכוב":"Archive","תפקיד":"Role","בקשות ואיסופים":"Requests & pickups","מלאי":"Inventory","דוחות":"Reports","סניפים מורשים":"Allowed branches","קטגוריות מורשות":"Allowed categories","שמירת מנהל":"Save manager","הסרה":"Remove"});
Object.assign(I18N.en,{"התאמות חכמות":"Smart matches","מוצרים מתאימים לבקשה":"Matching items","ציון התאמה":"Match score","הצעת המוצר":"Offer item","לא נמצאו כרגע מוצרים מתאימים.":"No matching items found right now.","בקשות העזרה שלי":"My community requests","בקשה חדשה":"New request","הצעות":"Offers"});
Object.assign(I18N.en,{"ביטול מצד הגמ״ח":"Cancel by gmach","סיבת הביטול שתישלח לשואל/ת:":"Cancellation reason to send to the borrower:","הבקשה עודכנה":"Request updated","זמינות הפריט עודכנה":"Item availability updated","הפריט הוסתר":"Item hidden","הפריט נשלח לבדיקה מחדש":"Item sent for review again"});
Object.assign(I18N.en,{
"קשת פרחים":"Flower arch","צפייה בגמ״ח":"View gmach","עדיין אין גמ״חים":"No gmachs yet","הקהילה נבנית בימים אלה.":"The community is growing.","להשוואה":"Compare","לפרטים":"Details","ניקוי":"Clear","דיווח":"Report","חלק מפרטי הגמ״ח אינם זמינים כרגע. אפשר לנסות שוב בעוד רגע.":"Some gmach details are temporarily unavailable. Please try again shortly.","ניסיון חוזר":"Try again","פתיחת השיחה":"Open chat","אין התראות חדשות":"No new notifications","עדכונים על בקשות ושיחות יופיעו כאן.":"Updates about requests and chats will appear here.","בחירת גמ״ח":"Select gmach","אין אירועי אבטחה להצגה.":"No security events to display.","שם הכתובת":"Address label","כתובת מלאה חדשה":"New full address","רשות, השאירו ריק כדי לא לשנות":"Optional, leave blank to keep unchanged","שמירת כתובת":"Save address","עוד לא נשמרו כתובות.":"No addresses saved yet.","שמירת הסינון הנוכחי":"Save current filters","ביטול בקשת מחיקת החשבון":"Cancel account deletion request","התראות חשובות על השאלות נשמרות גם באתר.":"Important loan notifications are also kept in the app.","ביטול מצד הגמ״ח":"Cancel by gmach","להמתין לתיאום חדש":"Wait for new pickup scheduling","לבטל את הבקשה":"Cancel the request","מועד החזרה חלופי, לדוגמה 2026-10-01T18:00":"Alternative return time, for example 2026-10-01T18:00","התאמות חכמות":"Smart matches","הצעת המוצר":"Offer item","לא נמצאו כרגע מוצרים מתאימים.":"No matching items were found right now.","בחירת ההצעה":"Select offer","עדיין אין הצעות.":"No offers yet.","לבחור בהצעה ולסגור את בקשת הקהילה?":"Select this offer and close the community request?","ההצעה נבחרה והבקשה נסגרה":"The offer was selected and the request was closed","שמירת המלאי פגה":"Inventory hold expired","ממתין לתיאום איסוף":"Waiting for pickup scheduling","זמן האיסוף פג":"Pickup window expired","אישור ההצעה":"Accept proposal","בחרו חלון חלופי ושלחו הצעה נגדית":"Choose an alternative window and send a counter proposal","מתאריך ושעה":"From date and time","עד תאריך ושעה":"Until date and time","איסוף":"Pickup","החזרה":"Return","שליחת השינוי לאישור":"Submit change for approval","מועד החזרה חדש":"New return time","הערה":"Note","שליחת בקשת הארכה":"Submit extension request","הוספת פריט":"Add item","נשלחה בקשה לתיאום איסוף חדש":"A request for new pickup scheduling was sent","הבקשה בוטלה":"The request was cancelled",
"ממתינה למענה":"Waiting for response","סגורה":"Closed","נפתחה מחדש":"Reopened","הצגת שיחה":"View conversation","סגירת פנייה":"Close ticket","הודעה נוספת":"Additional message","שליחה":"Send","צוות התמיכה":"Support team","אין הודעות נוספות בפנייה.":"No additional messages in this ticket.","הפנייה נפתחה מחדש.":"The ticket was reopened.","הפנייה נסגרה.":"The ticket was closed.","ההודעה נוספה לפנייה.":"The message was added to the ticket.","הצעות קטגוריה":"Category suggestions","אין אירועים חריגים.":"No unusual events.","מוסתרת":"Hidden","אין הצעות קטגוריה.":"No category suggestions.",
"חפשו מוצר לפי שם, עיר, מרחק וזמינות. בעמוד המוצר בוחרים תאריך, שעה וכמות.":"Search by item name, city, distance and availability. On the item page choose date, time and quantity.","באזור האישי תראו בקשות, החזרות, התראות, כתובות, מכשירים, מועדפים ולוח זמנים.":"Your account shows requests, returns, notifications, addresses, devices, saved items and schedule.","אם אתם מנהלים גמ״ח, המרכז המתקדם מרכז סניפים, מלאי, QR, הרשאות ודוחות.":"If you manage a gmach, the advanced center brings together branches, inventory, QR, permissions and reports.","אשף פתיחת גמ״ח ·":"Gmach setup wizard ·","סמן הוחזר":"Mark returned","זמין":"Available","לפני פתיחת פנייה — אולי זה יעזור:":"Before opening a ticket, this may help:","הביקורות שלי":"My reviews","ביקורות שכתבתי":"Reviews I wrote","ביקורות על הגמ״חים שלי":"Reviews of my gmachs","עדיין לא כתבת ביקורות.":"You have not written any reviews yet.","אין ביקורות שהתקבלו.":"No reviews received.","תגובה":"Reply","התגובה שלך:":"Your reply:","עריכת ביקורת":"Edit review","דירוג כללי 1-5":"Overall rating 1-5","דירוג מוצר 1-5":"Item rating 1-5","דירוג שירות 1-5":"Service rating 1-5","עדכון הביקורת":"Update review","הביקורת עודכנה":"Review updated","תגובת הגמ״ח לביקורת":"Gmach reply to review","תגובת הגמ״ח נשמרה":"Gmach reply saved",
"סיבוב יוחל בעת השמירה":"Rotation will be applied when saved","עריכת התמונות נשמרה לקראת ההעלאה":"Image edits were saved for upload","לא נמצאו מוצרים דומים כרגע.":"No similar items were found right now.","פתיחת דוח":"Open report","ייצוא מלאי ל־CSV":"Export inventory to CSV","CMS, גיבויים ושירותים":"CMS, backups & services","דיווחים ואכיפה":"Reports & enforcement","סטטוס שירותים":"Service status","טופל":"Resolved","אין דיווחים ממתינים.":"No pending reports.","בדיקת קובץ הגיבוי":"Validate backup file","קובץ הגיבוי תקין:":"Backup file is valid:","החיפוש מופעל רק בלחיצה. אפשר גם להשתמש במיקום הנוכחי באופן חד־פעמי.":"Search runs only when requested. You can also use your current location once.","המיקום הנוכחי":"Current location","העתקת כתובת":"Copy address","מחפשים…":"Searching...","לא נמצאה כתובת.":"No address found."
});
Object.assign(I18N.en,{
"גמ״ח ברגע — גדולה גמילות חסדים יותר מן הצדקה":"Gmach Berega - kindness in action","דלגו לתוכן הראשי":"Skip to main content","החיבור לשירות אינו זמין כרגע — אפשר לעיין באתר, ופעולות החשבון יחזרו עם חידוש החיבור.":"The service connection is currently unavailable. You can keep browsing, and account actions will return when the connection is restored.","גדולה גמילות חסדים יותר מן הצדקה":"Kindness goes beyond charity","איך זה עובד":"How it works","גמ״חים":"Gmachs","בקשת עזרה":"Ask for help","הצטרפו כגמ״ח":"Join as a gmach","נגישות":"Accessibility","הכול בהשאלה חינם":"Everything is free to borrow","מה תרצו":"What would you like to","לשאול היום?":"borrow today?","מוצאים ציוד להשאלה בחינם מגמ״חים ואנשים טובים קרוב לבית.":"Find equipment to borrow for free from gmachs and helpful people near you.","מה מחפשים?":"What are you looking for?","איפה?":"Where?","ללא תשלום":"Free of charge","דירוגים ממשתמשים":"User ratings","איסוף קרוב לבית":"Pickup near home","אני מחפש/ת עזרה או ציוד":"I am looking for help or equipment","חיפוש מהיר לפי צורך ואזור":"Quick search by need and area","אני מנהל/ת גמ״ח":"I manage a gmach","הצטרפות, מלאי ובקשות במקום אחד":"Membership, inventory and requests in one place","מתחילים בקטגוריה":"Start with a category","מה אפשר למצוא כאן?":"What can you find here?","הצגת הכול":"Show all","הכול":"All","כל מה שזמין":"Everything available","עיצוב, שולחנות וציוד":"Decor, tables and equipment","לבית ולתיקונים":"For home and repairs","עגלות, מיטות וכיסאות":"Strollers, beds and chairs","ציוד רפואי":"Medical equipment","שיקום וסיוע":"Rehabilitation and assistance","קמפינג ונסיעות":"Camping and travel","כלים, מזרנים ואביזרים":"Household items, mattresses and accessories","זמין בחינם":"Available for free","העזרה קרובה יותר ממה שחושבים":"Help is closer than you think","מגמ״ח מדורג באזור שלכם":"From a rated gmach in your area","זמין להשאלה":"Available to borrow","פריטים קרובים אליכם":"Items near you","טוענים פריטים זמינים…":"Loading available items...","סינון":"Filters","מיון תוצאות":"Sort results","מומלצים":"Recommended","חדשים":"Newest","לפי עיר":"By city","רשימה":"List","מפה":"Map","כל הקטגוריות":"All categories","כל המצבים":"All conditions","חדש":"New","כמו חדש":"Like new","מצב סביר":"Fair condition","בלאי נראה לעין":"Visible wear","השאלה":"Loan","מסירה":"Delivery","שירות":"Service","כל האפשרויות":"All options","רק פריטים זמינים":"Available items only","ניקוי סינון":"Clear filters","הצגת פריטים נוספים":"Show more items","קהילה פעילה":"Active community","גמ״חים ברחבי הארץ":"Gmachs across Israel","דירוגים ממשתמשים, מידע עדכני ופריטים זמינים.":"User ratings, current information and available items.","פשוט ונעים":"Simple and friendly","כך משאילים בגמ״ח ברגע":"How borrowing works on Gmach Berega","מוצאים":"Find","מחפשים לפי פריט ועיר ובוחרים את מה שמתאים.":"Search by item and city and choose what fits.","מבקשים":"Request","שולחים בקשת השאלה קצרה. מנהל הגמ״ח מאשר ומתאם.":"Send a short loan request. The gmach manager approves and coordinates.","אוספים ומחזירים":"Pick up and return","מקבלים את הפריט בחינם ומחזירים בזמן ובמצב טוב.":"Receive the item for free and return it on time and in good condition.","בקשה":"Request","אישור":"Approval","אוספים":"Pick up","מחזירים":"Return","החיבור שקורה ברגע":"A connection in a moment","בין מי שצריך למי שיכול לעזור":"Connecting those who need with those who can help","משתמש":"User","נמצא.":"Found.","משאילים בראש שקט":"Borrow with confidence","קהילה בטוחה, פרטיות ברורה":"A safe community with clear privacy","דירוגים מניסיון אמיתי":"Ratings from real experience","רק מי שהשלים השאלה יכול לדרג גמ״ח, מוצר ושירות, וניתן לדווח על מידע שגוי.":"Only users who completed a loan can rate a gmach, item and service, and incorrect information can be reported.","פרטים אישיים נשארים פרטיים":"Personal details stay private","פרטי קשר אינם מוצגים בקטלוג הפתוח ונחשפים רק למי שצריך.":"Contact details are not shown in the public catalog and are revealed only when needed.","הכול ללא תשלום":"Everything is free","הפרסום, הבקשה וההשאלה בפלטפורמה חינמיים לחלוטין.":"Listing, requesting and borrowing on the platform are completely free.","יש לכם ציוד שעוזר לאחרים?":"Have equipment that could help others?","מנהלים גמ״ח? הגיעו ליותר אנשים":"Run a gmach? Reach more people","פותחים עמוד, מפרסמים פריטים ומנהלים בקשות במקום אחד. הפרסום והניהול בחינם.":"Create a page, list items and manage requests in one place. Listing and management are free.","פתיחת גמ״ח בחינם":"Open a gmach for free","מה מקבלים?":"What do you get?","ניהול זמינות":"Availability management","בקשות מסודרות":"Organized requests","חשיפה קהילתית":"Community visibility","מוסיפים פריט":"Add an item","תמונה, זמינות ותנאי השאלה":"Image, availability and loan terms","פותחים עמוד גמ״ח":"Create a gmach page","אזור · קטגוריה · שעות פעילות":"Area · category · opening hours","הקהילה מוצאת אותו":"The community finds it","הפריט מופיע בחיפוש ובמפה":"The item appears in search and on the map","גם כשלא מצאתם":"Even when you did not find it","הבקשה שלכם יכולה להגיע לקהילה":"Your request can reach the community","ספרו מה אתם צריכים. הבקשה תוצג בלי פרטי קשר אישיים לגמ״חים שעשויים לעזור.":"Tell us what you need. Your request will be shown without personal contact details to gmachs that may be able to help.","בקשו עזרה":"Ask for help","עזרה שממשיכה הלאה":"Help that keeps going","קהילה שמשאילה, קהילה שצומחת":"A community that lends is a community that grows","מוצאים פריט":"Find an item","שולחים בקשה":"Send a request","מקבלים בחינם":"Receive for free","מחזירים בזמן":"Return on time","עוזר למשפחה הבאה":"Helps the next family","כל פריט חוזר למעגל וממשיך לעזור לעוד אנשים בקהילה.":"Every item returns to the cycle and continues helping more people in the community.","חיפוש פריט":"Search items","חשוב לדעת":"Good to know","שאלות נפוצות":"Frequently asked questions","האם השירות עולה כסף?":"Does the service cost money?","לא. החיפוש, הפרסום וההשאלה דרך האתר חינמיים.":"No. Searching, listing and borrowing through the site are free.","איך יודעים שהגמ״ח אמין?":"How can I know a gmach is trustworthy?","חפשו את סימון האימות, זמן הפעילות האחרון, עדכון המלאי והביקורות.":"Look for verification, recent activity, inventory updates and reviews.","איך מקבלים ציוד?":"How do I receive equipment?","שולחים בקשה עם תאריכים, מקבלים אישור ומתאמים בצ׳אט הפרטי.":"Send a request with dates, receive approval and coordinate in the private chat.","לא מצאתי את מה שחיפשתי—מה עושים?":"I could not find what I need. What should I do?","שולחים בקשת עזרה והיא מופיעה לגמ״חים הרלוונטיים.":"Send a help request and it will be shown to relevant gmachs.","→ חזרה לקטלוג":"← Back to catalog","שלום,":"Hello,","כל ההשאלות והפריטים שלך במקום אחד.":"All your loans and items in one place.","בקשות פעילות":"Active requests","פריטים שהוספתי":"Items I added","השאלות שהושלמו":"Completed loans","הבקשות שלי":"My requests","הפריטים שלי":"My items","הגמ״חים שלי":"My gmachs","הכתובות שלי":"My addresses","פרופיל והגדרות":"Profile & settings","ניהול האתר":"Site administration","יציאה מהחשבון":"Sign out","מחיקת החשבון והמידע":"Delete account and data","מחברים בין מי שיש לו לבין מי שצריך — בחינם, בפשטות ובאחריות.":"Connecting people who have with people who need - free, simple and responsible.","למצוא":"Find","כל הפריטים":"All items","לשתף":"Share","פרסום גמ״ח":"List a gmach","כללי השאלה בטוחה":"Safe borrowing guidelines","תנאי שימוש":"Terms of use","פרטיות":"Privacy","הצהרת נגישות":"Accessibility statement","יצירת קשר ותמיכה":"Contact & support","התאמה אישית":"Personalization","כלי נגישות":"Accessibility tools","בחרו את ההתאמות הנוחות לכם. ההעדפות נשמרות במכשיר הזה.":"Choose the settings that are comfortable for you. Preferences are saved on this device.","טקסט מוגדל":"Larger text","ניגודיות גבוהה":"High contrast","גווני אפור":"Grayscale","גופן קריא":"Readable font","הדגשת קישורים":"Underline links","עצירת תנועה":"Stop motion","איפוס התאמות":"Reset settings","הצהרת נגישות מלאה":"Full accessibility statement","כתבו לנו כאן ונקבל את הפנייה ישירות דרך האתר.":"Write to us here and we will receive your message directly through the site.","כתובת אימייל":"Email address","הודעה":"Message","שליחת הפנייה":"Send message","הרשמה":"Register","הכתובת נשמרת מוצפנת ואינה מוצגת בפרופיל הציבורי.":"The address is stored encrypted and is not shown on the public profile.","סיסמה":"Password","לפחות 10 תווים":"At least 10 characters","קראתי ואני מסכים/ה ל":"I have read and agree to","תנאי השימוש":"Terms of use","מדיניות הפרטיות":"Privacy policy","אני מסכים/ה לקבל הודעות תפעוליות הנחוצות להפעלת החשבון וההשאלות.":"I agree to receive operational messages required for the account and loans.","אני מעוניין/ת לקבל גם עדכוני קהילה והתנדבות":"I would also like to receive community and volunteering updates","(רשות)":"(optional)","שכחתי סיסמה":"Forgot password","איפוס סיסמה":"Reset password","נשלח קוד חד־פעמי לכתובת המייל הרשומה.":"A one-time code will be sent to the registered email address.","שליחת קוד":"Send code","קוד מהמייל":"Email code","סיסמה חדשה":"New password","שמירת סיסמה חדשה":"Save new password","אימות כתובת המייל":"Verify email address","שלחנו קוד בן 6 ספרות. הקוד תקף ל־10 דקות.":"We sent a 6-digit code. It is valid for 10 minutes.","קוד אימות":"Verification code","אימות וכניסה":"Verify and sign in","שליחת קוד חדש":"Send a new code","ניהול מלאי":"Inventory management","חסימות מלאי":"Inventory blocks","חסמו כמות לתקופה שבה פריטים נמצאים בתיקון, שמורים או אינם זמינים.":"Block a quantity while items are under repair, reserved or unavailable.","כמות לחסימה":"Quantity to block","סיבה":"Reason","הוספת חסימה":"Add block","רשימת ההמתנה מנוהלת אוטומטית לפי סדר ההצטרפות. מנהל הגמ״ח אינו בוחר מי קודם.":"The waitlist is managed automatically by join order. The gmach manager does not choose who comes first.","מתי תרצו את הפריט?":"When would you like the item?","הצטרפות לרשימת המתנה לטווח הזה":"Join the waitlist for this period","קראתי ואני מאשר/ת את תנאי הפיקדון.":"I have read and accept the deposit terms.","טלפון לתיאום":"Phone for coordination","כמה מילים למנהל הגמ״ח":"A few words for the gmach manager","אני מתחייב/ת לשמור על הפריט ולהחזיר אותו בזמן ובמצב שבו התקבל.":"I agree to take care of the item and return it on time in the condition in which it was received.","שליחת הבקשה":"Send request","הבקשה וההשאלה ללא תשלום":"The request and loan are free","מצטרפים לקהילה":"Join the community","ממלאים פרטים בסיסיים. העמוד יפורסם אוטומטית לאחר הוספת המוצר הראשון.":"Enter basic details. The page will be published automatically after the first item is added.","שם הגמ״ח":"Gmach name","סוג הגוף המפעיל":"Operating entity type","קהילה או בית כנסת":"Community or synagogue","תחום מרכזי":"Main area","בחירה":"Choose","שכונה":"Neighborhood","(תוצג בעמוד הגמ״ח)":"(shown on the gmach page)","אפשרויות מסירה":"Delivery options","תיאור קצר":"Short description","טלפון ליצירת קשר":"Contact phone","(יוצג בעמוד הגמ״ח)":"(shown on the gmach page)","פריט חדש":"New item","פרטים מדויקים עוזרים למבקשים לדעת אם הפריט מתאים.":"Accurate details help borrowers know whether the item fits their needs.","שייך לגמ״ח":"Belongs to gmach","שם הפריט":"Item name","לא מצאתי קטגוריה":"I cannot find a category","כמות זמינה":"Available quantity","אופן קבלה":"Pickup method","קטגוריית משנה":"Subcategory","תגיות":"Tags","תיאור והוראות שימוש":"Description and instructions","משך מינימלי (דקות)":"Minimum duration (minutes)","משך מקסימלי (דקות)":"Maximum duration (minutes)","כמה זמן מראש להזמין (דקות)":"Booking notice (minutes)","זמן התארגנות בין השאלות (דקות)":"Turnaround between loans (minutes)","עד כמה ימים מראש ניתן להזמין":"How many days ahead can be booked","אישור הזמנה":"Booking approval","אישור מנהל הגמ״ח":"Gmach manager approval","אישור אוטומטי אם יש מלאי":"Automatic approval when inventory is available","פרסום עתידי":"Scheduled publication","מקסימום יחידות למשתמש":"Maximum units per user","זמן הכנה נוסף (דקות)":"Additional preparation time (minutes)","מקסימום ימי השאלה":"Maximum loan days","רדיוס שירות בקילומטרים":"Service radius in kilometers","נדרש פיקדון להבטחת החזרת המוצר כפי שנלקח (לא כתשלום עבור ההשאלה).":"A deposit is required to ensure the item is returned as received (not as payment for the loan).","סכום הפיקדון (₪)":"Deposit amount (₪)","לא ניתן לקבוע איסוף או החזרה מיום שישי בשעה 17:00 ועד שבת בשעה 21:00.":"Pickup or return cannot be scheduled from Friday at 17:00 until Saturday at 21:00.","תמונות הפריט":"Item images","(אפשר עד 12 תמונות, כל תמונה עד 5MB)":"(up to 12 images, 5 MB each)","הפריט מוצע להשאלה חינמית בלבד.":"The item is offered for free loan only.","עדכון בקשה":"Update request","אישור בקשת ההשאלה":"Approve loan request","אפשר לצרף הוראות איסוף או הודעה קצרה.":"You can add pickup instructions or a short message.","הודעה לשואל/ת":"Message to borrower","אישור הבקשה":"Approve request","שיחה פרטית":"Private chat","תיאום ההשאלה":"Loan coordination","כתיבת הודעה":"Write a message","השיחה זמינה רק לשואל/ת, למנהל/ת הגמ״ח ולהנהלת האתר.":"The chat is available only to the borrower, the gmach manager and the site administrator.","נשארים מעודכנים":"Stay updated","סימון הכול כנקרא":"Mark all as read","שומרים על הקהילה":"Keeping the community safe","דיווח על פריט":"Report item","הדיווח נשלח להנהלת האתר ואינו מוצג למפרסם.":"The report is sent to the site administrator and is not shown to the listing owner.","מה הבעיה?":"What is the issue?","מידע לא נכון":"Incorrect information","פריט לא בטיחותי":"Unsafe item","בקשת תשלום":"Payment request","הפריט אינו זמין":"Item unavailable","אחר":"Other","פרטים נוספים":"Additional details","שליחת דיווח":"Submit report","לא מצאתם?":"Could not find it?","שליחת בקשת עזרה":"Send a help request","הבקשה תוצג ללא טלפון או אימייל לגמ״חים שעשויים לעזור.":"The request will be shown without phone or email to gmachs that may be able to help.","מה אתם צריכים?":"What do you need?","לא בטוח/ה":"Not sure","תיאור":"Description","הבקשה דחופה":"Urgent request","פרסום הבקשה":"Publish request","איך הייתה ההשאלה?":"How was the loan?","דירוג הגמ״ח":"Gmach rating","★★★★★ — מצוין":"★★★★★ - Excellent","★★★★☆ — טוב מאוד":"★★★★☆ - Very good","★★★☆☆ — בסדר":"★★★☆☆ - Okay","★★☆☆☆ — טעון שיפור":"★★☆☆☆ - Needs improvement","★☆☆☆☆ — לא טוב":"★☆☆☆☆ - Poor","דירוג הפריט":"Item rating","שירות ויחס":"Service & interaction","ביקורת":"Review","פרסום הדירוגים":"Publish ratings"
});
Object.assign(I18N.en,{
"מצב הפריט":"Item condition","א+":"A+","אא":"Aa","קישור":"Link","עודכנה לאחרונה: 23 בספטמבר 2026.":"Last updated: September 23, 2026.","גמ״ח ברגע פועל כדי לאפשר לכל אדם, לרבות אנשים עם מוגבלות, להשתמש באתר באופן עצמאי, שוויוני, מכבד ונוח. בתכנון האתר אנו שואפים ליישם את עקרונות תקן WCAG 2.2 ברמה AA ככל האפשר.":"Gmach Berega works to enable everyone, including people with disabilities, to use the site independently, equally, respectfully and comfortably. We aim to apply WCAG 2.2 Level AA principles wherever possible.","התאמות שבוצעו באתר":"Accessibility measures implemented","מבנה סמנטי, כותרות ואזורים ברורים לקוראי מסך.":"Semantic structure, headings and clear regions for screen readers.","ניווט מלא באמצעות מקלדת, קישור דילוג לתוכן ומיקוד חזותי בולט.":"Full keyboard navigation, a skip-to-content link and visible focus indicators.","שמות נגישים לכפתורים, שדות, חלונות ותמונות משמעותיות.":"Accessible names for buttons, fields, dialogs and meaningful images.","ניגודיות צבעים, הגדלת טקסט והתאמה למסכים ולתצוגה מוגדלת.":"Color contrast, text enlargement and responsive support for zoomed displays.","כיבוד הגדרת המכשיר להפחתת תנועה ואפשרות לעצור תנועה דרך תפריט הנגישות.":"Respect for reduced-motion device settings and an option to stop motion through the accessibility menu.","הודעות מצב ושגיאה שניתנות לזיהוי גם בטכנולוגיות מסייעות.":"Status and error messages that can also be detected by assistive technologies.","שימוש בכלי הנגישות":"Using the accessibility tools","הכפתור הצף מאפשר להגדיל טקסט, להפעיל ניגודיות גבוהה או גווני אפור, לבחור גופן קריא, להדגיש קישורים ולעצור אנימציות. ניתן לאפס את כל ההתאמות בכל עת.":"The floating button lets you enlarge text, enable high contrast or grayscale, choose a readable font, underline links and stop animations. All settings can be reset at any time.","מגבלות ידועות":"Known limitations","האתר מתעדכן באופן שוטף וחלק מהתכנים מוזנים בידי משתמשים. ייתכן שתוכן חדש, תמונה שהועלתה או רכיב של שירות חיצוני עדיין לא הותאמו במלואם. אין בכך כדי לגרוע מהמחויבות שלנו לתקן ליקויים במהירות האפשרית.":"The site is updated continuously and some content is supplied by users. New content, uploaded images or third-party components may not yet be fully accessible. We remain committed to fixing accessibility issues as quickly as possible.","פנייה בנושא נגישות":"Accessibility contact","אם נתקלתם בקושי, ספרו לנו מה ניסיתם לעשות, באיזה עמוד, באיזה מכשיר ובאיזו טכנולוגיה מסייעת השתמשתם. ניתן לפנות באמצעות טופס \"יצירת קשר ותמיכה\" באתר. נעשה מאמץ להשיב בהקדם ולספק חלופה נגישה.":"If you encounter a difficulty, tell us what you tried to do, the page, device and assistive technology you used. Contact us through the site’s Contact & Support form. We will aim to respond promptly and provide an accessible alternative.","ול":"and","פיקדון:":"Deposit:","₪. הפיקדון נועד להבטיח את החזרת המוצר כפי שנלקח ואינו תשלום עבור ההשאלה.":"₪. The deposit is intended to ensure return of the item as received and is not payment for the loan.","רשות או מוסד":"Public authority or institution","אני מאשר/ת שהפעילות, הפריטים, הבקשות והתיאום ינוהלו בתוך גמ״ח ברגע; שהפריטים יוצעו ללא תשלום; ושקראתי את":"I confirm that activity, items, requests and coordination will be managed within Gmach Berega; items will be offered free of charge; and that I have read the","ואת":"and the","דירוג הסניף":"Branch rating"
});
Object.assign(I18N.en,window.GmachEnglish||{});
Object.assign(I18N.en,window.GmachEnglish||{});
Object.assign(I18N.en,{
"ביקורות ותגובות":"Reviews & responses","ביקורות ותגובות הגמ״ח":"Gmach reviews & responses","תגובה לביקורת":"Respond to review","תגובת הגמ״ח לביקורת:":"Gmach response to the review:","תגובת הגמ״ח נשמרה":"Gmach response saved","אין עדיין ביקורות לגמ״ח.":"This gmach has no reviews yet.","הביקורות שלי":"My reviews","עדיין לא כתבת ביקורות.":"You have not written any reviews yet.","עריכה":"Edit","דירוג חדש 1-5:":"New rating 1-5:","עדכון הביקורת:":"Update review:","הביקורת עודכנה":"Review updated","תגובת הגמ״ח:":"Gmach response:","ללא טקסט":"No text","תיאום איסוף חדש":"Reschedule pickup","ביטול לאחר אי הגעה":"Cancel after missed pickup","נשלחה בקשה לתיאום חלון איסוף חדש":"A request to reschedule pickup was sent","הבקשה בוטלה והמלאי שוחרר":"The request was cancelled and inventory was released","שמירת המלאי פגה":"Inventory hold expired","חלון האיסוף הסתיים":"Pickup window ended","אי הגעה לאיסוף":"Missed pickup","הצעת המוצר":"Offer item","מוצרים מתאימים לבקשה":"Matching items for the request","לא נמצאו כרגע מוצרים מתאימים.":"No matching items were found right now.","ההצעה נשלחה":"Offer sent","כלים מתקדמים לגמ״ח":"Advanced gmach tools","העברת בעלות":"Transfer ownership","אימייל הבעלים החדש":"New owner's email","שליחת הזמנה":"Send invitation","סגירה ומחיקה":"Closure & deletion","פתיחה מחדש":"Reopen","סגירה זמנית":"Temporarily close","בקשת מחיקה בעוד 7 ימים":"Request deletion in 7 days","ביטול בקשת מחיקה":"Cancel deletion request","העברת מלאי בין סניפים":"Transfer inventory between branches","מזהה יחידה":"Unit ID","מסניף":"From branch","לסניף":"To branch","ללא סניף":"No branch","התחלת העברה":"Start transfer","אישור קבלה":"Confirm receipt","אין העברות פעילות.":"No active transfers.","פעולות מלאי קבוצתיות":"Bulk inventory actions","פעולה":"Action","הפעלה":"Activate","השבתה":"Deactivate","שינוי זמינות":"Change availability","שינוי כמות":"Change quantity","שינוי קטגוריה":"Change category","ערך":"Value","ביצוע על המוצרים שנבחרו":"Apply to selected items","ייבוא מוצרים":"Import items","בדיקה וייבוא":"Validate and import","אין מוצרים זמינים.":"No items available.","מחיקה לפי היסטוריה":"History-aware deletion","מוצרים מתאימים":"Matching items"
});
const I18N_FINAL_EN={
  "חיפוש גמ\"חים מתקדם": "Advanced gmach search",
  "שם, תיאור או עיר": "Name, description or city",
  "כל הארץ": "All Israel",
  "דירוג מינימלי": "Minimum rating",
  "ללא סינון": "No rating filter",
  "רק גמ״חים עם פריט זמין": "Only gmachs with an available item",
  "מחפשים גמ״חים…": "Searching gmachs…",
  "לא נמצאו גמ״חים מתאימים": "No matching gmachs found",
  "נסו להסיר מסנן או להרחיב את החיפוש.": "Try removing a filter or broadening the search.",
  "לא הצלחנו להשלים את החיפוש": "We could not complete the search",
  "פנייה לתמיכה עם פרטי התקלה": "Contact support with error details",
  "תקלה בטעינת עמוד גמ״ח": "Error loading gmach page",
  "תקלה בטעינת האזור האישי": "Error loading account area",
  "מתאריך": "From date",
  "עד תאריך": "To date",
  "כל הסניפים": "All branches",
  "כל הקטגוריות": "All categories",
  "החלת סינון": "Apply filters",
  "בקשות בטווח": "Requests in range",
  "הצלחה בטווח": "Success in range",
  "מגמת בקשות": "Request trend",
  "אין בקשות בטווח הזה.": "No requests in this range.",
  "לוח פעולות קרובות": "Upcoming operations",
  "אין פעולות קרובות.": "No upcoming operations.",
  "ייצוא פעולות מסוננות ל-CSV": "Export filtered operations CSV",
  "ייצוא מלאי ל-CSV": "Export inventory CSV",

  "הוספת מוצר חדש וקישור לבקשה": "Add a new item and link it to the request",
  "המוצר פורסם וקושר אוטומטית לבקשת הקהילה": "The item was published and automatically linked to the community request",
  "המוצר פורסם, אך הקישור לבקשת הקהילה לא הושלם:": "The item was published, but linking it to the community request was not completed:",
  "נוסף מוצר חדש במיוחד עבור בקשת הקהילה הזו.": "A new item was added specifically for this community request.",
  "הקישור לבקשה הועתק": "The request link was copied",
  "לא הצלחנו לשתף את הבקשה": "We could not share the request",

  "גמ\"חים קרובים": "Nearby gmachs",
  "המיקום משמש לחיפוש הזה בלבד ואינו נשמר.": "Your location is used only for this search and is not stored.",
  "מבקשים את המיקום רק כדי למצוא גמ״חים קרובים": "Location is requested only to find nearby gmachs",
  "לא ניתנה הרשאת מיקום. אפשר לחפש לפי עיר.": "Location permission was not granted. You can search by city.",
  "המכשיר אינו מאפשר קבלת מיקום. אפשר לחפש לפי עיר.": "This device does not provide location access. You can search by city.",
  "לא נמצאו גמ״חים עם נקודת איסוף פעילה בטווח של 30 ק״מ.": "No gmachs with an active pickup point were found within 30 km.",
  "מקורות הגעה": "Acquisition sources",
  "אתרים מפנים": "Referring sites",
  "ייצוא נתוני שימוש CSV": "Export usage data CSV",

  "גמ\"חים שנצפו לאחרונה": "Recently viewed gmachs",
  "מתחילים מכאן": "Start here",
  "חיפוש ציוד": "Find equipment",
  "פרסום בקשת עזרה": "Post a help request",
  "אפליקציית ניווט מועדפת": "Preferred navigation app",
  "מתי צריך?": "When do you need it?",
  "עד מתי?": "Until when?",
  "טווח חיפוש בק\"מ": "Search radius in km",
  "טווח:": "Radius:",
  "מועד:": "Time:",
  "סניף איסוף חלופי": "Alternate pickup branch",
  "אפשר להציע סניף אחר. ההחלפה תיכנס לתוקף רק לאחר אישור הצד השני.": "You can propose another branch. The change takes effect only after the other side approves it.",
  "הצעות קודמות": "Previous proposals",
  "בחירת סניף חלופי": "Choose an alternate branch",
  "שליחת הצעה": "Send proposal",
  "הצעת הסניף נשלחה לצד השני": "The branch proposal was sent to the other side",
  "סניף האיסוף החלופי אושר": "The alternate pickup branch was approved",
  "הצעת הסניף נדחתה": "The branch proposal was declined",
  "הגמ״ח נוצר - משלימים את ההקמה": "Gmach created - finish setup",
  "הוספת המוצר הראשון": "Add the first item",
  "תצוגה מקדימה": "Preview",
  "מעבר לניהול הגמ\"ח": "Go to gmach management",
  "שלושה דברים שכדאי לעשות עכשיו": "Three useful next steps",
  "הבנתי, לא להציג שוב": "Got it, do not show again",
  "אם נתקלתם בקושי, ספרו לנו מה ניסיתם לעשות, באיזה עמוד, באיזה מכשיר ובאיזו טכנולוגיה מסייעת השתמשתם. ניתן לפנות באמצעות טופס \"יצירת קשר ותמיכה\" באתר. נעשה מאמץ להשיב בהקדם ולספק חלופה נגישה.": "If you encounter an accessibility difficulty, tell us what you tried to do, which page and device you used, and which assistive technology you used. You can contact us through the Contact and Support form on the site. We will make every effort to respond promptly and provide an accessible alternative.",
  "טווח חיפוש בק\"מ": "Search radius in km",
  "למשל 20": "For example, 20",
  "אפשר לייצא עותק מקיף של נתוני החשבון, ההשאלות, ההודעות, ההסכמות, המועדפים, החיפושים, האבטחה והתמיכה, או לפתוח בקשת עיון ותיקון.": "Export a comprehensive copy of your account, loans, messages, consents, saved content, searches, security and support data, or submit an access or correction request.",
  

  "דירוג הקהילה": "Community rating",
  "פריטים": "Items",
  "דירוגים": "reviews",
  "השוואה": "Compare",
  "השוו עד חמישה פריטים ובחרו מה מתאים לכם.": "Compare up to five items and choose what fits you.",
  "הגמ״ח סגור זמנית": "This gmach is temporarily closed",
  "מועד הפתיחה מחדש יעודכן בהמשך.": "The reopening date will be updated.",
  "איך מקבלים?": "How do I get it?",
  "כתובת ויצירת קשר": "Address and contact",
  "פריטים בגמ״ח": "Items at this gmach",
  "דירוגי משתמשים": "User reviews",
  "סניף": "Branch",
  "מועילה": "Helpful",
  "לא הצלחנו לטעון את עמוד הגמ״ח": "Could not load the gmach page",
  "מספר תקלה לתמיכה:": "Support reference:",
  "עדכונים על פעולות באתר": "Updates about site activity",
  "עדכונים מהקהילה": "Community updates",
  "שמירת פרטים": "Save details",
  "בחרו יומן. אירועי האיסוף וההחזרה נשמרים בנפרד.": "Choose a calendar. Pickup and return events are saved separately.",
  "Apple / ICS - שני האירועים": "Apple / ICS - both events",
  "אי-הגעה": "No-show",
  "למוצר אין יחידות סידוריות. ניתן לסמן איסוף ישירות.": "This item has no serialized units. Pickup can be confirmed directly.",
  "לאחר האישור היחידות ישוחררו למלאי ורשימת ההמתנה תתקדם אוטומטית.": "After confirmation, the units return to inventory and the waitlist advances automatically.",
  "הערת החזרה": "Return note",
  "אין בקשות עזרה פתוחות.": "There are no open help requests.",
  "מצב נוכחי:": "Current status:",
  "שינוי בקשת השאלה": "Change loan request",
  "עוד לא פורסמו פריטים": "No items have been published yet",
  "הוסיפו את הפריט הראשון ותנו לו לעזור לעוד משפחה.": "Add the first item and let it help another family.",
  "שכפול": "Duplicate",
  "יחידות ו-QR": "Units and QR",
  "שמור": "Saved",
  "מושאל": "On loan",
  "בתיקון": "In repair",
  "לא פעיל": "Inactive",
  "יצא משימוש": "Retired",
  "היסטוריה": "History",
  "אין יחידות סידוריות.": "No serialized units.",
  "מספר יחידות": "Number of units",
  "מזהה סניף": "Branch ID",
  "יצירת יחידות": "Create units",
  "הדפסת כל תוויות ה-QR": "Print all QR labels",
  "אין ממתינים פעילים.": "No active waitlist entries.",
  "הדביקו CSV עם העמודות title,category,description,condition,quantity,city,neighborhood.": "Paste CSV with the columns title, category, description, condition, quantity, city and neighborhood.",
  "כתובת": "Address",
  "אין מנהלים נוספים.": "No additional managers.",
  "ללא בחירה = כל הסניפים": "No selection = all branches",
  "ללא בחירה = כל הקטגוריות": "No selection = all categories",
  "בתוקף עד": "valid until",
  "✦ הפיכת האתר למצב עריכה": "Enable live site editing",
  "איפוס כל העריכות החזותיות": "Reset all visual edits",
  "לחיצה על כל רכיב באתר תפתח את כל אפשרויות העיצוב שלו.": "Click any site element to open its design controls.",
  "משתמשים": "Users",
  "בקשות": "Requests",
  "עיצוב ותוכן האתר": "Site design and content",
  "שם האתר": "Site name",
  "סלוגן": "Tagline",
  "כותרת ראשית": "Main heading",
  "תיאור ראשי": "Main description",
  "צבע ראשי": "Primary color",
  "צבע משני": "Secondary color",
  "צבע הדגשה": "Accent color",
  "גופן": "Font",
  "גודל בסיס": "Base size",
  "כתובת לוגו": "Logo URL",
  "שמירת עיצוב ותוכן": "Save design and content",
  "היסטוריית גרסאות": "Version history",
  "שחזור": "Restore",
  "אבטחת החשבון שלי": "My account security",
  "שינוי סיסמה": "Change password",
  "נוצר:": "Created:",
  "כניסה אחרונה:": "Last sign-in:",
  "הרשאה": "Role",
  "מנהל": "Admin",
  "מושעה": "Suspended",
  "מייל מאומת": "Email verified",
  "כל הגמ״חים": "All gmachs",
  "כל בקשות ההשאלה": "All loan requests",
  "גרסאות עריכה חיה": "Live edit versions",
  "בדיקת פריטים ודיווחים": "Item and report review",
  "פריטים שממתינים לבדיקה": "Items pending review",
  "פרסום": "Publish",
  "דיווחים": "Reports",
  "מדדי שימוש וביקוש": "Usage and demand metrics",
  "חיפושים נפוצים": "Popular searches",
  "ערים מובילות": "Top cities",
  "קטגוריות מבוקשות": "Popular categories",
  "התאמות מוצלחות": "Successful matches",
  "מתוך": "of",
  "יומן פעילות": "Activity log",
  "ללא שינוי": "No change",
  "עריכה חיה": "Live editing",
  "לחצו על כל רכיב באתר כדי לערוך אותו.": "Click any element on the site to edit it.",
  "טקסט": "Text",
  "גודל": "Size",
  "צבע": "Color",
  "רקע": "Background",
  "יישור": "Alignment",
  "רגיל": "Normal",
  "ימין": "Right",
  "מרכז": "Center",
  "שמאל": "Left",
  "רוחב": "Width",
  "הזזה אופקית": "Horizontal offset",
  "הזזה אנכית": "Vertical offset",
  "רווח עליון": "Top margin",
  "רווח תחתון": "Bottom margin",
  "ריפוד": "Padding",
  "סדר": "Order",
  "מושבת": "Disabled",
  "שמירת השדות ששונו": "Save changed fields",
  "איפוס הרכיב": "Reset element",
  "סרקו באפליקציית Authenticator": "Scan in your authenticator app",
  "מפתח ידני:": "Manual key:",
  "אישור והפעלה": "Confirm and enable",
  "טוענים בקשות פתוחות…": "Loading open requests...",
  "הצעת עזרה": "Offer help",
  "איך תוכלו לעזור?": "How can you help?",
  "שליחת הצעה": "Send offer",
  "אין בקשות פתוחות שמתאימות לסינון הזה.": "No open requests match these filters.",
  "עמוד": "Page",
  "למחוק את המוצר? אם קיימת היסטוריה היא תישמר באופן מינימלי.": "Delete this item? Minimal history will be retained if required.",
  "הפעולה הושלמה על": "Action completed for",
  "הזמנת העברת הבעלות נשלחה עד": "Ownership transfer invitation sent, valid until",
  "בחרו מועד פתיחה מחדש": "Choose a reopening time",
  "להתחלת מחיקה הקלידו את שם הגמ״ח:": "Type the gmach name to start deletion:",
  "בקשת המחיקה נקלטה. ניתן לבטל בתקופת ההמתנה.": "Deletion request received. It can be cancelled during the waiting period.",
  "הסניף נסגר זמנית והלווים הפעילים עודכנו": "The branch was temporarily closed and active borrowers were notified",
  "הסניף חזר לפעילות": "The branch is active again",
  "לארכב את הסניף?": "Archive this branch?",
  "העתיקו את קישור ההזמנה:": "Copy the invitation link:",
  "הרשאות המנהל נשמרו": "Manager permissions saved",
  "להסיר את המנהל?": "Remove this manager?",
  "מה הבעיה בהודעה?": "What is wrong with this message?",
  "המשתמש נחסם בהתאם למצב ההשאלה": "The user was blocked according to the loan status",
  "נוספתם לרשימת ההמתנה. נעדכן אתכם כשהפריט יתפנה.": "You joined the waitlist. We will notify you when the item becomes available.",
  "איזו קטגוריה חסרה?": "Which category is missing?",
  "תיאור קצר שיעזור לנו להבין מה שייך לקטגוריה, אופציונלי": "Optional short description to help us understand the category",
  "הצעת הקטגוריה נשלחה להנהלת האתר": "Category suggestion sent to the administrator",
  "יש להתחבר כדי לקבל את הזמנת הניהול": "Sign in to accept the management invitation",
  "הצטרפת לצוות הניהול": "You joined the management team",
  "שולחים את הפנייה…": "Sending your request...",
  "הפנייה נשלחה בהצלחה.": "Your request was sent successfully.",
  "מאת": "From",
  "אל": "To",
  "הוספה": "Add",
  "כתובת חדשה, רק אם רוצים להחליף": "New address, only if you want to replace it",
  "המועדפים שלי": "My favorites",
  "עדיין אין תוכן שמור.": "No saved content yet.",
  "סטטוס:": "Status:",
  "מיזוג לתוך קטגוריה...": "Merge into category...",
  "מיזוג קטגוריה": "Merge category",
  "בחרו קטגוריית יעד.": "Choose a destination category.",
  "הקטגוריה מוזגה.": "Category merged.",
  "שלב": "Step",
  "סמן נאסף": "Mark collected",
  "מופעים": "occurrences",
  "אין פריטים פתוחים.": "No open items.",
  "דירוג סניף 1-5": "Branch rating 1-5",
  "סה״כ": "Total",
  "המוצרים המבוקשים": "Most requested items",
  "שם מלא": "Full name",
  "טלפון": "Phone",
  "עיר/יישוב": "City / locality",
  "שפה": "Language",
  "הפרטים נשמרו.": "Details saved.",
  "העברות בעלות": "Ownership transfers",
  "הזמנות שקיבלת": "Invitations received",
  "קבלת בעלות": "Accept ownership",
  "העברות ששלחת": "Transfers sent",
  "אין הזמנות ממתינות.": "No pending invitations.",
  "אין העברות שנשלחו.": "No transfers sent.",
  "הנתונים שלי": "My data",
  "ייצוא הנתונים שלי": "Export my data",
  "בקשת עיון": "Access request",
  "בקשת תיקון": "Correction request",
  "כתובות פרטיות": "Private addresses",
  "מכשירים מחוברים": "Connected devices",
  "המכשיר הזה": "This device",
  "אירועי אבטחה אחרונים": "Recent security events",
  "לא נמצאו מכשירים מחוברים.": "No connected devices found.",
  "אין אירועי אבטחה להצגה.": "No security events to show."
};
Object.assign(I18N.en,I18N_FINAL_EN,{
  "יצירת קשר":"Contact","אזור אישי, כניסה או הרשמה":"My account, sign in or register",
  "- גמ״ח ברגע":"- Gmach Berega","איסוף:":"Pickup:","החזרה:":"Return:",
  "ההשאלה הקרובה ·":"Next loan ·","המוצר הוסתר עד לסיום ההשאלות הפעילות":"The item is hidden until active loans are completed",
  "ניהול מלאי —":"Inventory management -","יחידות ·":"Units ·","· כמות":"· Quantity",
  "זמינות, כמות או קטגוריה":"Availability, quantity or category",
  "שורות ללא title או city. הייבוא לא בוצע.":"rows without title or city. Nothing was imported.",
  "שורות תקינות. לייבא עכשיו?":"valid rows. Import now?","עם":"with",
  "לבטל גם בקשות עתידיות שטרם נאספו? לחצו ביטול כדי להשאיר אותן פעילות ורק להודיע לשואלים.":"Cancel future requests that have not been collected? Choose Cancel to keep them active and only notify borrowers.",
  "הגמ״ח נסגר והבקשות העתידיות בוטלו":"The gmach closed and future requests were cancelled",
  "הגמ״ח נסגר והמשתמשים קיבלו הודעה":"The gmach closed and users were notified",
  "#/catalog או https://...":"#/catalog or https://...",
  "לחסום את המשתמש? אם קיימת השאלה פעילה, החסימה המלאה תיכנס לתוקף לאחר סיומה.":"Block this user? If an active loan exists, the full block will take effect after it ends.",
  "· דחוף":"· Urgent","השליחה לא הושלמה":"Sending was not completed",
  "לא הצלחנו לשלוח כרגע. נסו שוב בעוד רגע.":"We could not send this now. Please try again shortly.",
  "הפעולה דורשת קוד אישור נוסף שיישלח למייל המנהל. להמשיך?":"This action requires an additional code sent to the administrator's email. Continue?",
  "לא ניתן ליצור קוד אישור":"Could not create a confirmation code",
  "הזינו את קוד האישור בן 6 הספרות שנשלח למייל:":"Enter the six-digit confirmation code sent by email:",
  "מה תרצו לקבל בבקשת העיון?":"What would you like to receive in your access request?",
  "איזה מידע תרצו לתקן?":"What information would you like to correct?",
  "פרטי הבקשה":"Request details","שליחת הבקשה":"Send request","אישור בקשת המחיקה":"Confirm deletion request",
  "חיפוש קטגוריה":"Find a category","שם קטגוריה":"Category name",
  "הבנתי ואני מבקש/ת להתחיל בתהליך מחיקת החשבון":"I understand and request account deletion",
  "לאחר שליחת הבקשה אפשר לבטל אותה במשך שבעה ימים בלשונית הפרופיל.":"You can cancel the request within seven days from your profile.",
  "אפשר לייצא עותק של נתוני החשבון או לשלוח בקשה לעיון ולתיקון מידע.":"Export a copy of your account data or request access to or correction of your data.",
  "להתחיל תהליך מחיקת חשבון? ניתן לבטל במשך שבעה ימים.":"Start account deletion? You can cancel within seven days.",
  "בקשת המחיקה נקלטה. אפשר לבטל אותה דרך לשונית הפרופיל.":"Your deletion request was received. You can cancel it from the Profile tab.",
  "· רק זמינים":"· Available only",
  "יש פריטים בקטגוריה הזו, אך הם אינם זמינים כרגע. בטלו את הסינון 'רק פריטים זמינים' כדי לראות אותם ולבדוק אפשרות לתיאום.":"There are items in this category, but none are available right now. Turn off 'Available items only' to view them and ask about arrangements.",
  "למזג את הקטגוריה? כל השיוכים יעברו לקטגוריית היעד והקטגוריה הנוכחית תוסתר.":"Merge this category? All assignments will move to the destination category and the current category will be hidden.",
  "לפרטים ←":"Details ←","פרט":"Item","Google - איסוף":"Google - pickup","Google - החזרה":"Google - return",
  "Outlook - איסוף":"Outlook - pickup","Outlook - החזרה":"Outlook - return",
  "אין חסימות מלאי.":"No inventory blocks.","יחידות":"units","מקום":"Position","אין סניפים.":"No branches.",
  "אימייל משתמש":"User email","בקשת מחיקה מתחילה תקופת המתנה של שבעה ימים. אם יש השאלות פעילות, הטיפול ימתין לסגירתן.":"Requesting deletion starts a seven-day waiting period. If active loans exist, deletion waits until they end.",
  "6 שעות":"6 hours","12 שעות":"12 hours","24 שעות":"24 hours","48 שעות":"48 hours",
  "לכל השאלה נוצר אירוע איסוף ואירוע החזרה. אפשר להוריד אותם מכרטיס ההשאלה.":"Each loan has a separate pickup and return event. Download them from the loan card.",
  "מוצרים, גמ״חים, קטגוריות, בקשות קהילה וחיפושים שמורים במקום אחד.":"Items, gmachs, categories, community requests and saved searches in one place.",
  "📷 תמונה":"📷 Photo","🎤 קול":"🎤 Voice","📍 מיקום":"📍 Location"
});
let lang=localStorage.getItem("gmach-language")||document.documentElement.lang||"he";
function replaceTranslatedPhrase(text,he,en){let out=text,pos=0;const isHeb=c=>!!c&&/[\u0590-\u05FF]/.test(c),starts=isHeb(he[0]),ends=isHeb(he[he.length-1]);while((pos=out.indexOf(he,pos))!==-1){const before=out[pos-1]||"",after=out[pos+he.length]||"";if((starts&&isHeb(before))||(ends&&isHeb(after))){pos+=he.length;continue}out=out.slice(0,pos)+en+out.slice(pos+he.length);pos+=en.length}return out}function translateText(raw){if(!raw)return raw;if(I18N.en[raw])return I18N.en[raw];let out=raw;for(const [he,en] of Object.entries(I18N.en).sort((a,b)=>b[0].length-a[0].length)){if(he.length>2&&out.includes(he))out=replaceTranslatedPhrase(out,he,en)}return out}const USER_CONTENT_SELECTOR=".item-detail-description,#item-dialog-title,.item-card h3,.item-card p,.organization-hero>p,.review-list blockquote p,.chat-message p,.community-board-card>h3,.community-board-card>p";function isUserContentNode(n){return !!n?.parentElement?.closest?.(USER_CONTENT_SELECTOR)}window.GmachTranslate=value=>lang==="en"?translateText(value):value;function translateNode(n){if(lang!=="en"||isUserContentNode(n))return;const full=n.nodeValue||"",trim=full.trim();if(!trim)return;const option=n.parentElement?.tagName==="OPTION"?n.parentElement:null;if(option&&!option.hasAttribute("value"))option.setAttribute("value",trim);const translated=translateText(trim);if(translated!==trim)n.nodeValue=full.replace(trim,translated)}Object.assign(I18N.en,{"פרחים":"Flowers","מתאימים":"matching","עודכן":"Updated","פרטי קשר נמסרים רק לאחר אישור הבקשה":"Contact details are shared only after the request is approved","גמ״ח ברגע \u2014 גדולה גמילות חסדים יותר מן הצדקה":"Gmach Berega - Kindness connects communities"});window.GmachSearchAliases=()=>Object.entries(I18N.en).filter(([he,en])=>/[\u0590-\u05ff]/.test(he)&&/^[a-z][a-z\s-]{2,}$/i.test(en));
function translate(root=document.body){if(lang!=="en")return;document.documentElement.lang="en";document.documentElement.dir="ltr";const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode())translateNode(n);$$("input[placeholder],textarea[placeholder],[title],[aria-label],input[type=button][value],input[type=submit][value]",root).forEach(el=>{for(const a of ["placeholder","title","aria-label","value"]){if(a==="value"&&!el.matches("input[type=button],input[type=submit]"))continue;const v=el.getAttribute(a);if(v){const translated=translateText(v);if(translated!==v)el.setAttribute(a,translated)}}})}
function observeTranslations(){if(lang!=="en")return;const o=new MutationObserver(ms=>{for(const m of ms){if(m.type==="characterData"){translateNode(m.target);continue}if(m.type==="attributes"){const el=m.target,a=m.attributeName,v=el.getAttribute(a);if(v&&(!(["value"].includes(a))||el.matches("input[type=button],input[type=submit]"))){const translated=translateText(v);if(translated!==v)el.setAttribute(a,translated)}continue}for(const n of m.addedNodes){if(n.nodeType===Node.TEXT_NODE)translateNode(n);else if(n.nodeType===Node.ELEMENT_NODE)translate(n)}}});o.observe(document.body,{childList:true,characterData:true,attributes:true,attributeFilter:["placeholder","title","aria-label","value"],subtree:true})}
function installLanguage(){
 if(lang==="en"){document.title=translateText(document.title);const meta=document.querySelector('meta[name="description"]');if(meta)meta.content=translateText(meta.content)}
 if($("#language-switch"))return;const host=$(".header-actions")||document.body;const b=document.createElement("button");b.id="language-switch";b.type="button";b.className="button button-secondary";b.textContent=lang==="en"?"עברית":"English";b.setAttribute("aria-label","החלף שפה");b.onclick=()=>{lang=lang==="en"?"he":"en";localStorage.setItem("gmach-language",lang);api("/api/me/profile",{method:"PATCH",body:{preferredLanguage:lang}}).catch(()=>{});if(lang==="he"){location.reload();return}document.documentElement.lang="en";document.documentElement.dir="ltr";b.textContent="עברית";const mobileSwitch=$("#mobile-language-switch");if(mobileSwitch)mobileSwitch.textContent="עברית";document.title=translateText(document.title);const meta=document.querySelector('meta[name="description"]');if(meta)meta.content=translateText(meta.content);translate(document.body);observeTranslations();window.dispatchEvent(new Event("gmach-language-change"))};host.appendChild(b);const mobile=$("#mobile-menu");if(mobile&&!$("#mobile-language-switch",mobile)){const m=document.createElement("button");m.id="mobile-language-switch";m.type="button";m.textContent=lang==="en"?"עברית":"English";m.setAttribute("aria-label","החלף שפה");m.onclick=b.onclick;mobile.append(m)};if(lang==="en"){document.title=translateText(document.title);const meta=document.querySelector('meta[name="description"]');if(meta)meta.content=translateText(meta.content);translate(document.body);observeTranslations()}
}
function dialog(id,title){let d=$("#"+id);if(!d){d=document.createElement("dialog");d.id=id;d.className="modal modal-wide";document.body.append(d)}d.innerHTML='<button class="dialog-close" type="button" aria-label="סגירה">×</button><div class="dialog-heading"><h2>'+esc(title)+'</h2></div><div class="remaining-body"></div>';$(".dialog-close",d).onclick=()=>d.close();return d}
function fileToCanvas(file){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{const c=document.createElement("canvas");c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext("2d").drawImage(img,0,0);URL.revokeObjectURL(url);resolve(c)};img.onerror=reject;img.src=url})}
function canvasToFile(canvas,name,type="image/webp"){return new Promise(resolve=>canvas.toBlob(blob=>resolve(new File([blob],name.replace(/\.[^.]+$/,"")+".webp",{type:"image/webp"})),"image/webp",.9))}
async function transformFile(entry){
 let c=await fileToCanvas(entry.file),rot=entry.rotation||0;
 if(rot){const out=document.createElement("canvas"),ctx=out.getContext("2d");if(rot%180){out.width=c.height;out.height=c.width}else{out.width=c.width;out.height=c.height}ctx.translate(out.width/2,out.height/2);ctx.rotate(rot*Math.PI/180);ctx.drawImage(c,-c.width/2,-c.height/2);c=out}
 if(entry.crop){const size=Math.min(c.width,c.height),sx=(c.width-size)/2,sy=(c.height-size)/2,out=document.createElement("canvas");out.width=out.height=size;out.getContext("2d").drawImage(c,sx,sy,size,size,0,0,size,size);c=out}
 if(entry.blur){const ctx=c.getContext("2d"),w=c.width*.35,h=c.height*.25,x=(c.width-w)/2,y=(c.height-h)/2;ctx.save();ctx.filter="blur(18px)";ctx.drawImage(c,x-30,y-30,w+60,h+60,x,y,w,h);ctx.restore()}
 return canvasToFile(c,entry.file.name)
}
function installImageEditor(){
 const input=$("#item-images");if(!input||input.dataset.editorReady)return;input.dataset.editorReady="1";let entries=[];
 input.addEventListener("change",async()=>{entries=[...input.files].slice(0,12).map((file,i)=>({file,primary:i===0,rotation:0,crop:false,blur:false}));if(!entries.length)return;openEditor()});
 async function openEditor(){const d=dialog("image-editor-dialog",lang==="en"?"Manage images":"ניהול תמונות"),body=$(".remaining-body",d);body.innerHTML='<div id="img-list" style="display:grid;gap:12px"></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px"><button class="button button-secondary" id="img-cancel" type="button">ביטול</button><button class="button button-primary" id="img-save" type="button">שמירה</button></div>';const list=$("#img-list",d);
 const render=()=>{list.innerHTML="";entries.forEach((e,i)=>{const row=document.createElement("div");row.style.cssText="display:grid;grid-template-columns:96px 1fr;gap:12px;align-items:center;border:1px solid #e5e7eb;border-radius:14px;padding:10px";const img=document.createElement("img");img.src=URL.createObjectURL(e.file);img.style.cssText="width:96px;height:80px;object-fit:cover;border-radius:10px";const controls=document.createElement("div");controls.innerHTML=`<strong>${esc(e.file.name)}</strong><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px"><label><input type="radio" name="primary" ${e.primary?"checked":""}> תמונה ראשית</label><button type="button" class="button button-secondary" data-rot>סיבוב</button><button type="button" class="button button-secondary" data-crop>חיתוך ריבועי ${e.crop?"✓":""}</button><button type="button" class="button button-secondary" data-blur>טשטוש מרכז ${e.blur?"✓":""}</button><button type="button" class="button button-secondary" data-up>↑</button><button type="button" class="button button-secondary" data-down>↓</button><button type="button" class="button button-secondary" data-del>מחיקה</button></div>`;controls.querySelector('input[type=radio]').onchange=()=>{entries.forEach(x=>x.primary=false);e.primary=true};controls.querySelector("[data-rot]").onclick=()=>{e.rotation=(e.rotation+90)%360;toast("סיבוב יוחל בעת השמירה")};controls.querySelector("[data-crop]").onclick=()=>{e.crop=!e.crop;render()};controls.querySelector("[data-blur]").onclick=()=>{e.blur=!e.blur;render()};controls.querySelector("[data-up]").onclick=()=>{if(i>0){[entries[i-1],entries[i]]=[entries[i],entries[i-1]];render()}};controls.querySelector("[data-down]").onclick=()=>{if(i<entries.length-1){[entries[i+1],entries[i]]=[entries[i],entries[i+1]];render()}};controls.querySelector("[data-del]").onclick=()=>{entries.splice(i,1);if(entries.length&&!entries.some(x=>x.primary))entries[0].primary=true;render()};row.append(img,controls);list.append(row)})};render();
 $("#img-cancel",d).onclick=()=>d.close();$("#img-save",d).onclick=async()=>{try{const ordered=[...entries].sort((a,b)=>Number(b.primary)-Number(a.primary)),files=[];for(const e of ordered)files.push(await transformFile(e));const dt=new DataTransfer();files.forEach(f=>dt.items.add(f));input.files=dt.files;d.close();toast("עריכת התמונות נשמרה לקראת ההעלאה")}catch(e){toast(e.message,true)}};d.showModal()}
}
async function enhanceItemDialog(){
 const host=$("#item-dialog-content"),id=host?.dataset.itemId;if(!id||host.dataset.remainingId===id)return;host.dataset.remainingId=id;const actions=$(".detail-actions",host)||host;const avail=document.createElement("button");avail.type="button";avail.className="button button-secondary";avail.textContent=lang==="en"?"Availability calendar":"לוח זמינות";avail.onclick=()=>showAvailability(id);actions.append(avail);const similar=document.createElement("button");similar.type="button";similar.className="button button-secondary";similar.textContent=lang==="en"?"Similar items":"מוצרים דומים";similar.onclick=()=>showSimilar(id);actions.append(similar)
}
async function showAvailability(id){
 const d=dialog("availability-dialog",lang==="en"?"Availability calendar":"לוח זמינות"),body=$(".remaining-body",d);body.innerHTML="<p>טוענים…</p>";d.showModal();
 try{
  const data=await api("/api/items/"+encodeURIComponent(id)+"/availability-calendar?days=90"),days=data.days||[],busy=data.busyIntervals||[];
  const months=[...new Set(days.map(day=>day.date.slice(0,7)))];let current=months[0];
  const render=()=>{
   const monthDays=days.filter(day=>day.date.startsWith(current));const offset=(new Date(current+"-01T12:00:00Z").getUTCDay()+6)%7;
   const label=date=>new Intl.DateTimeFormat(lang==="en"?"en-US":"he-IL",{day:"numeric",month:"long",timeZone:"UTC"}).format(new Date(date+"T12:00:00Z"));
   body.innerHTML=`<div class="availability-toolbar"><button type="button" data-prev-month ${months.indexOf(current)===0?"disabled":""} aria-label="${lang==="en"?"Previous month":"חודש קודם"}">‹</button><strong>${esc(new Intl.DateTimeFormat(lang==="en"?"en-US":"he-IL",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(current+"-01T12:00:00Z")))}</strong><button type="button" data-next-month ${months.indexOf(current)===months.length-1?"disabled":""} aria-label="${lang==="en"?"Next month":"חודש הבא"}">›</button></div><div class="availability-weekdays">${(lang==="en"?["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]:["ב׳","ג׳","ד׳","ה׳","ו׳","ש׳","א׳"]).map(v=>`<span>${v}</span>`).join("")}</div><div class="availability-month">${Array(offset).fill("<span></span>").join("")}${monthDays.map(day=>`<button type="button" data-availability-day="${esc(day.date)}" class="${day.available>0?"is-free":"is-busy"}" aria-label="${esc(label(day.date))}: ${day.available>0?(lang==="en"?"Available":"זמין"):(lang==="en"?"Busy":"תפוס")}">${Number(day.date.slice(8))}<i></i></button>`).join("")}</div><div id="availability-day-detail" role="status"></div>`;
   $("[data-prev-month]",body).onclick=()=>{current=months[months.indexOf(current)-1];render()};$("[data-next-month]",body).onclick=()=>{current=months[months.indexOf(current)+1];render()};
   $$('[data-availability-day]',body).forEach(button=>button.onclick=()=>{
    const date=button.dataset.availabilityDay,from=Date.parse(date+"T00:00:00Z"),until=from+86400000;
    const entries=busy.filter(v=>Date.parse(v.from)<until&&Date.parse(v.until)>from);
    const time=t=>new Date(t).toLocaleTimeString(lang==="en"?"en-US":"he-IL",{timeZone:"UTC",hour:"2-digit",minute:"2-digit"});
    const detail=$("#availability-day-detail",body);
    detail.innerHTML="<h3>"+esc(label(date))+"</h3>"+(entries.length?entries.map(v=>"<p>⏱ "+esc(time(Math.max(from,Date.parse(v.from))))+"–"+esc(time(Math.min(until,Date.parse(v.until))))+" · "+(lang==="en"?"Busy":"תפוס")+" ("+Number(v.quantity)+")</p>").join(""):(lang==="en"?"No booked hours":"אין שעות תפוסות"));
   });
  };render();
 }catch(error){body.innerHTML='<p role="alert">'+esc(error.message)+'</p>'}
}
async function showSimilar(id){const d=dialog("similar-dialog",lang==="en"?"Similar items":"מוצרים דומים"),b=$(".remaining-body",d);b.innerHTML="<p>טוענים…</p>";d.showModal();try{const data=await api("/api/items/"+encodeURIComponent(id)+"/similar");b.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">${data.items.map(x=>`<article style="border:1px solid #e5e7eb;border-radius:12px;padding:12px"><strong>${esc(x.title)}</strong><p>${esc(x.organization_name||"")} · ${esc(x.city||"")}</p></article>`).join("")||"<p>לא נמצאו מוצרים דומים כרגע.</p>"}</div>`}catch(e){b.innerHTML='<p>'+esc(e.message)+'</p>'}}
async function enhanceOrganizationDialog(){
 const host=$("#organization-dialog-content"),id=host?.dataset.organizationId;if(!id||host.dataset.remainingId===id)return;host.dataset.remainingId=id;
 try{
   await api("/api/organizations/"+encodeURIComponent(id)+"/operations-dashboard");
   const box=document.createElement("section");box.style.cssText="margin-top:16px;border-top:1px solid #e5e7eb;padding-top:16px";box.innerHTML='<h3>'+(lang==="en"?"Operations snapshot":"דוח תפעולי")+'</h3><button type="button" class="button button-secondary" data-ops>פתיחת דוח</button>';box.querySelector("[data-ops]").onclick=()=>showOps(id);host.append(box);
 }catch{}
}
async function showOps(id){
 const d=dialog("ops-dialog",lang==="en"?"Operations dashboard":"דוח תפעולי"),b=$(".remaining-body",d);d.showModal();
 const load=async(params=new URLSearchParams())=>{
  b.innerHTML="<p>"+(lang==="en"?"Loading…":"טוענים…")+"</p>";
  try{
   const suffix=params.toString()?"?"+params.toString():"",x=await api("/api/organizations/"+encodeURIComponent(id)+"/operations-dashboard"+suffix);
   const from=params.get("from")||String(x.range?.from||"").slice(0,10),to=params.get("to")||String(x.range?.to||"").slice(0,10),branch=params.get("branch")||"",category=params.get("category")||"";
   const maxDaily=Math.max(1,...(x.daily||[]).map(row=>Number(row.total||0)));
   const pct=x.range?.total?Math.round(Number(x.range.successful||0)*100/Number(x.range.total)):0;
   const exportParams=new URLSearchParams();if(from)exportParams.set("from",from);if(to)exportParams.set("to",to);if(branch)exportParams.set("branch",branch);if(category)exportParams.set("category",category);
   b.innerHTML=`<form id="ops-filters" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:14px">
    <label>${lang==="en"?"From":"מתאריך"}<input name="from" type="date" value="${esc(from)}"></label>
    <label>${lang==="en"?"To":"עד תאריך"}<input name="to" type="date" value="${esc(to)}"></label>
    <label>${lang==="en"?"Branch":"סניף"}<select name="branch"><option value="">${lang==="en"?"All branches":"כל הסניפים"}</option>${(x.filters?.branches||[]).map(row=>`<option value="${esc(row.id)}" ${String(row.id)===branch?"selected":""}>${esc(row.name)} · ${esc(row.city||"")}</option>`).join("")}</select></label>
    <label>${lang==="en"?"Category":"קטגוריה"}<select name="category"><option value="">${lang==="en"?"All categories":"כל הקטגוריות"}</option>${(x.filters?.categories||[]).map(value=>`<option value="${esc(value)}" ${value===category?"selected":""}>${esc(value)}</option>`).join("")}</select></label>
    <button class="button button-primary" type="submit">${lang==="en"?"Apply filters":"החלת סינון"}</button>
   </form>
   <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
    ${[["בקשות חדשות",x.newRequests],["איסופים היום",x.pickupsToday],["החזרות היום",x.returnsToday],["באיחור",x.late],["הודעות לא נקראו",x.unreadMessages],["דירוגים 30 יום",x.reviews30d],["בקשות בטווח",x.range?.total||0],["הצלחה בטווח",pct+"%"]].map(([k,v])=>`<article style="padding:14px;border:1px solid #e5e7eb;border-radius:12px;text-align:center"><strong style="font-size:1.4rem">${v}</strong><div>${lang==="en"?(window.GmachTranslate?.(k)||k):k}</div></article>`).join("")}
   </div>
   <h3>${lang==="en"?"Inventory":"מלאי"}</h3><p>${lang==="en"?"Total":"סה״כ"} ${x.inventory.total} · ${lang==="en"?"Available":"זמין"} ${x.inventory.available} · ${lang==="en"?"On loan":"מושאל"} ${x.inventory.loaned} · ${lang==="en"?"Repair":"תיקון"} ${x.inventory.repair}</p>
   <h3>${lang==="en"?"Requests trend":"מגמת בקשות"}</h3><div style="display:grid;gap:6px">${(x.daily||[]).map(row=>`<div style="display:grid;grid-template-columns:88px 1fr 36px;gap:8px;align-items:center"><small>${esc(row.day)}</small><div style="height:10px;background:#eef2f5;border-radius:999px;overflow:hidden"><span style="display:block;height:100%;width:${Math.max(3,Math.round(Number(row.total||0)*100/maxDaily))}%;background:currentColor;opacity:.55"></span></div><strong>${Number(row.total||0)}</strong></div>`).join("")||`<p>${lang==="en"?"No requests in this range.":"אין בקשות בטווח הזה."}</p>`}</div>
   <h3>${lang==="en"?"Upcoming operations":"לוח פעולות קרובות"}</h3><div style="display:grid;gap:8px">${(x.upcoming||[]).slice(0,30).map(row=>`<article style="border:1px solid #e5e7eb;border-radius:12px;padding:10px"><strong>${esc(row.title)}</strong><p>${esc(row.borrower_name||"")} · ${esc(row.branch_name||"")} · ${esc(row.status)}</p><small>${esc(row.requested_from)} - ${esc(row.requested_until)}</small></article>`).join("")||`<p>${lang==="en"?"No upcoming operations.":"אין פעולות קרובות."}</p>`}</div>
   <h3>${lang==="en"?"Most requested items":"המוצרים המבוקשים"}</h3><ol>${(x.topItems||[]).map(i=>`<li>${esc(i.title)} - ${Number(i.loans||0)}</li>`).join("")}</ol>
   <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="button button-secondary" href="/api/organizations/${encodeURIComponent(id)}/operations-export.csv?${esc(exportParams.toString())}" download>${lang==="en"?"Export filtered operations CSV":"ייצוא פעולות מסוננות ל-CSV"}</a><button type="button" class="button button-secondary" id="ops-export-csv">${lang==="en"?"Export inventory CSV":"ייצוא מלאי ל-CSV"}</button></div>`;
   $("#ops-filters",d).onsubmit=e=>{e.preventDefault();const fd=new FormData(e.currentTarget),next=new URLSearchParams();for(const key of ["from","to","branch","category"]){const value=String(fd.get(key)||"").trim();if(value)next.set(key,value)}load(next)};
   $("#ops-export-csv",d).onclick=async()=>{try{
    const response=await fetch("/api/organizations/"+encodeURIComponent(id)+"/inventory-export.csv",{credentials:"same-origin"});
    if(!response.ok){const error=await response.json();throw new Error(error.error||"הייצוא נכשל")}
    const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download="gmach-inventory.csv";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
   }catch(error){toast(error.message,true)}};
  }catch(e){b.innerHTML='<p role="alert">'+esc(e.message)+'</p>'}
 };
 await load();
}
function installAdminRemaining(){
 const observer=new MutationObserver(async()=>{const tools=$("#platform-tools-dialog .pt-body");if(!tools)return;if(!profileIsAdmin()){$("#remaining-admin-card",tools)?.remove();return}if($("#remaining-admin-card",tools))return;const card=document.createElement("section");card.id="remaining-admin-card";card.className="pt-card";card.innerHTML='<h3>CMS, גיבויים ושירותים</h3><div class="pt-row"><button class="pt-btn" data-cms>CMS ותוכן</button><button class="pt-btn" data-moderation>דיווחים ואכיפה</button><button class="pt-btn" data-backups>גיבויים</button><button class="pt-btn" data-services>סטטוס שירותים</button></div>';tools.prepend(card);card.querySelector("[data-cms]").onclick=openCms;card.querySelector("[data-moderation]").onclick=openUnifiedModeration;card.querySelector("[data-backups]").onclick=openBackups;card.querySelector("[data-services]").onclick=openServices});observer.observe(document.body,{subtree:true,childList:true})
}
function profileIsAdmin(){const tab=document.querySelector("#admin-tab");return Boolean(tab&&!tab.hidden)}
async function openCms(){const d=dialog("cms-dialog",lang==="en"?"CMS & content":"CMS ותוכן"),b=$(".remaining-body",d);b.innerHTML="<p>טוענים…</p>";d.showModal();try{const data=await api("/api/admin/page-content");b.innerHTML=`<form id="cms-form" style="display:grid;gap:8px"><input name="key" placeholder="content key" required><select name="language"><option value="he">עברית</option><option value="en">English</option></select><select name="status"><option value="published">published</option><option value="draft">draft</option><option value="scheduled">scheduled</option><option value="archived">archived</option></select><input name="publishAt" type="datetime-local"><textarea name="content" rows="10" placeholder="תוכן"></textarea><button class="button button-primary">שמירה</button></form><hr><div id="cms-existing">${data.pages.map(p=>`<button type="button" class="button button-secondary" data-key="${esc(p.content_key)}" data-lang="${p.language}">${esc(p.content_key)} · ${p.language}</button>`).join(" ")}</div>`;const f=$("#cms-form",d);f.onsubmit=async e=>{e.preventDefault();const fd=new FormData(f);await api("/api/admin/page-content",{method:"PUT",body:{key:fd.get("key"),language:fd.get("language"),status:fd.get("status"),publishAt:fd.get("publishAt")||null,content:fd.get("content")}});toast("התוכן נשמר")};$$("[data-key]",d).forEach(x=>x.onclick=()=>{const p=data.pages.find(p=>p.content_key===x.dataset.key&&p.language===x.dataset.lang);f.key.value=p.content_key;f.language.value=p.language;f.status.value=p.status;f.content.value=p.content})}catch(e){b.innerHTML='<p>'+esc(e.message)+'</p>'}}
async function openUnifiedModeration(){const d=dialog("moderation-dialog",lang==="en"?"Reports & moderation":"דיווחים ואכיפה"),b=$(".remaining-body",d);b.innerHTML="<p>טוענים…</p>";d.showModal();const render=async()=>{try{const x=await api("/api/admin/moderation-unified?status=pending");b.innerHTML=(x.reports||[]).length?"<div style=\"display:grid;gap:8px\">"+x.reports.map(r=>"<article style=\"border:1px solid #e5e7eb;border-radius:12px;padding:12px\"><strong>"+esc(r.source)+" · "+esc(r.entity_title||r.entity_id)+"</strong><p>"+esc(r.reason||"")+" "+esc(r.details||"")+"</p><small>"+esc(r.reporter_name||"")+" · "+esc(r.created_at||"")+"</small><div style=\"display:flex;gap:6px;flex-wrap:wrap;margin-top:8px\"><button class=\"button button-secondary\" data-mod-action=\"reviewed\" data-source=\""+esc(r.source)+"\" data-id=\""+esc(r.id)+"\">טופל</button><button class=\"button button-secondary\" data-mod-action=\"dismissed\" data-source=\""+esc(r.source)+"\" data-id=\""+esc(r.id)+"\">דחייה</button><button class=\"button button-danger\" data-mod-action=\"removed\" data-source=\""+esc(r.source)+"\" data-id=\""+esc(r.id)+"\">הסרה</button></div></article>").join("")+"</div>":"<p>אין דיווחים ממתינים.</p>";$$("[data-mod-action]",d).forEach(btn=>btn.onclick=async()=>{try{await api("/api/admin/moderation-unified",{method:"PATCH",body:{source:btn.dataset.source,id:btn.dataset.id,action:btn.dataset.modAction}});toast("הדיווח טופל");await render()}catch(e){toast(e.message,true)}})}catch(e){b.innerHTML="<p>"+esc(e.message)+"</p>"}};await render()}
async function openBackups(){
 const d=dialog("backups-dialog",lang==="en"?"Backups":"גיבויים"),b=$(".remaining-body",d);
 b.innerHTML="<p>טוענים…</p>";d.showModal();
 try{
  const x=await api("/api/admin/backups");
  b.innerHTML="<div style=\"display:grid;gap:8px\">"+(x.backups||[]).map(v=>"<article style=\"border:1px solid #e5e7eb;border-radius:12px;padding:12px\"><strong>"+esc(v.backup_type)+" · "+esc(v.status)+"</strong><p>"+esc(v.started_at)+"</p>"+(v.status==="completed"?"<button type=\"button\" class=\"button button-secondary\" data-validate-backup=\""+esc(v.id)+"\">בדיקת קובץ הגיבוי</button>":"")+"</article>").join("")+"</div>";
  d.querySelectorAll("[data-validate-backup]").forEach(btn=>btn.onclick=async()=>{btn.disabled=true;try{const r=await api("/api/admin/backups/"+encodeURIComponent(btn.dataset.validateBackup)+"/validate",{method:"POST",body:{}});toast("קובץ הגיבוי תקין: "+r.validation.rowCount+" רשומות")}catch(e){toast(e.message,true)}finally{btn.disabled=false}});
 }catch(e){b.innerHTML="<p role=\"alert\">"+esc(e.message)+"</p>"}
}
async function openServices(){const d=dialog("services-dialog","סטטוס שירותים"),b=$(".remaining-body",d);b.innerHTML="<p>טוענים…</p>";d.showModal();try{const x=await api("/api/admin/external-services");b.innerHTML='<ul>'+Object.entries(x.services).map(([k,v])=>'<li><strong>'+esc(k)+'</strong>: '+(v?"מוגדר":"חסר")+'</li>').join("")+'</ul>'}catch(e){b.innerHTML='<p>'+esc(e.message)+'</p>'}}
function installA11y(){
 document.addEventListener("invalid",e=>{const el=e.target;if(el&&el.focus){setTimeout(()=>el.focus(),0)}},true);
 document.addEventListener("keydown",e=>{if(e.key==="Escape")$$("dialog[open]").forEach(d=>d.close())});
}

function osmEmbed(lat,lon){
 const span=.018,bbox=[lon-span,lat-span,lon+span,lat+span].join("%2C");
 return "https://www.openstreetmap.org/export/embed.html?bbox="+bbox+"&layer=mapnik&marker="+encodeURIComponent(lat+","+lon);
}
async function showAddressMap(){
 const d=dialog("map-dialog",lang==="en"?"Map & location":"מפה ומיקום"),b=$(".remaining-body",d);
 let navPref=localStorage.getItem("gmach-navigation-app")||"google";try{const pref=await api("/api/me/navigation-preferences");navPref=pref.preferences?.preferred_app||navPref}catch{}
 b.innerHTML=`<label style="display:block;margin-bottom:10px">${lang==="en"?"Preferred navigation app":"אפליקציית ניווט מועדפת"}<select id="map-nav-pref"><option value="google" ${navPref==="google"?"selected":""}>Google Maps</option><option value="waze" ${navPref==="waze"?"selected":""}>Waze</option><option value="apple" ${navPref==="apple"?"selected":""}>Apple Maps</option></select></label><form id="map-search" autocomplete="off" style="display:grid;grid-template-columns:1fr auto;gap:8px"><input name="q" type="search" autocomplete="off" minlength="3" aria-label="כתובת לחיפוש" placeholder="עיר, רחוב ומספר" required><button class="button button-primary">חיפוש</button></form><p class="platform-note">החיפוש מופעל רק בלחיצה. אפשר גם להשתמש במיקום הנוכחי באופן חד־פעמי.</p><button type="button" class="button button-secondary" id="map-current">המיקום הנוכחי</button><div id="map-results" role="status" aria-live="polite" style="display:grid;gap:8px;margin-top:12px"></div><div id="map-frame" style="margin-top:12px"></div><small>© OpenStreetMap contributors</small>`;
 d.showModal();const form=$("#map-search",d),results=$("#map-results",d),frame=$("#map-frame",d);$("#map-nav-pref",d).onchange=async e=>{navPref=e.target.value;localStorage.setItem("gmach-navigation-app",navPref);try{await api("/api/me/navigation-preferences",{method:"PUT",body:{preferredApp:navPref}})}catch{};toast(lang==="en"?"Navigation preference saved":"העדפת הניווט נשמרה")};
 const renderMap=(lat,lon,label)=>{frame.innerHTML=`<iframe title="${esc(label||"מפה")}" src="${osmEmbed(Number(lat),Number(lon))}" style="width:100%;height:360px;border:0;border-radius:14px" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><a class="button ${navPref==="google"?"button-primary":"button-secondary"}" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lat+","+lon)}">Google Maps</a><a class="button ${navPref==="waze"?"button-primary":"button-secondary"}" target="_blank" rel="noopener" href="https://waze.com/ul?ll=${encodeURIComponent(lat+","+lon)}&navigate=yes">Waze</a><a class="button ${navPref==="apple"?"button-primary":"button-secondary"}" target="_blank" rel="noopener" href="https://maps.apple.com/?ll=${encodeURIComponent(lat+","+lon)}&q=${encodeURIComponent(label||"יעד")}">Apple Maps</a><button class="button button-secondary" type="button" data-copy-map-address>העתקת כתובת</button></div>`;frame.querySelector("[data-copy-map-address]")?.addEventListener("click",async()=>{await navigator.clipboard.writeText(label||String(lat)+","+String(lon));toast("הכתובת הועתקה")})};
 form.onsubmit=async e=>{e.preventDefault();results.innerHTML="<p>מחפשים…</p>";try{const x=await api("/api/maps/geocode?q="+encodeURIComponent(form.q.value));results.innerHTML=x.results.length?x.results.map((r,i)=>`<button type="button" class="button button-secondary" data-map-i="${i}" style="text-align:start">${esc(r.displayName)}</button>`).join(""):"<p>לא נמצאה כתובת.</p>";$$("[data-map-i]",results).forEach(btn=>btn.onclick=()=>{const r=x.results[Number(btn.dataset.mapI)];renderMap(r.lat,r.lon,r.displayName)})}catch(e){results.innerHTML="<p role=alert>"+esc(e.message)+"</p>"}};
 $("#map-current",d).onclick=()=>navigator.geolocation?.getCurrentPosition(pos=>renderMap(pos.coords.latitude,pos.coords.longitude,"המיקום הנוכחי"),()=>toast("לא התקבלה הרשאת מיקום",true),{enableHighAccuracy:false,timeout:8000,maximumAge:60000});
}
function installMapEntry(){
 if($("#map-entry"))return;const host=$(".header-actions");if(!host)return;const b=document.createElement("button");b.id="map-entry";b.type="button";b.className="button button-secondary";b.textContent=lang==="en"?"Map":"מפה";b.onclick=showAddressMap;host.append(b);const bell=$("#notifications-button"),account=$("#dashboard-button");if(bell&&account&&bell.parentElement===host){account.after(bell);bell.after(b)}
}
async function openCategoryManager(type,id){
  const d=dialog("category-manager-dialog",lang==="en"?"Categories":"קטגוריות"),b=$(".remaining-body",d);b.innerHTML="<p>טוענים…</p>";d.showModal();
  try{const all=await api("/api/categories"),current=await api("/api/"+(type==="item"?"items":"organizations")+"/"+encodeURIComponent(id)+"/categories"),rows=all.categories||all.items||[],selected=new Set((current.categories||[]).map(x=>x.id));
    const form=document.createElement("form"),grid=document.createElement("div");grid.style.cssText="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;max-height:55vh;overflow:auto";
    rows.forEach(x=>{const label=document.createElement("label");label.style.cssText="border:1px solid #e5e7eb;border-radius:12px;padding:10px";const input=document.createElement("input");input.type="checkbox";input.name="category";input.value=x.id;input.checked=selected.has(x.id);const strong=document.createElement("strong");strong.textContent=" "+(lang==="en"?(x.name_en||x.name_he):x.name_he);label.append(input,strong);grid.append(label)});
    const save=document.createElement("button");save.className="button button-primary";save.textContent=lang==="en"?"Save":"שמירה";save.style.marginTop="12px";form.append(grid,save);b.innerHTML="";b.append(form);
    form.onsubmit=async e=>{e.preventDefault();const ids=[...new FormData(form).getAll("category")];await api("/api/"+(type==="item"?"items":"organizations")+"/"+encodeURIComponent(id)+"/categories",{method:"PUT",body:{categoryIds:ids}});toast(lang==="en"?"Categories saved":"הקטגוריות נשמרו");d.close()};
  }catch(e){b.innerHTML="<p role=\"alert\">"+esc(e.message)+"</p>"}
}
function installCategoryButtons(){
  $$("[data-edit-item]").forEach(edit=>{const row=edit.closest(".dashboard-row");if(!row||row.querySelector("[data-extra-categories]"))return;const b=document.createElement("button");b.type="button";b.className="button button-secondary button-small";b.dataset.extraCategories="item";b.textContent=lang==="en"?"Categories":"קטגוריות";b.onclick=()=>openCategoryManager("item",edit.dataset.editItem);(row.querySelector(".dashboard-row-actions")||row).appendChild(b)});
  $$("[data-edit-org]").forEach(edit=>{const row=edit.closest(".dashboard-row");if(!row||row.querySelector("[data-extra-categories]"))return;const b=document.createElement("button");b.type="button";b.className="button button-secondary button-small";b.dataset.extraCategories="organization";b.textContent=lang==="en"?"Categories":"קטגוריות";b.onclick=()=>openCategoryManager("organization",edit.dataset.editOrg);(row.querySelector(".dashboard-row-actions")||row).appendChild(b)});
}
function renderOrgCategoryTiles(){const host=$("#organization-dialog-content"),id=host?.dataset.organizationId;if(!id||host.querySelector(".remaining-category-tiles"))return;api("/api/organizations/"+encodeURIComponent(id)+"/public").then(data=>{const cats=data.organization?.categories||[];if(!cats.length)return;const section=document.createElement("section");section.className="remaining-category-tiles";const h=document.createElement("h3");h.textContent=lang==="en"?"Categories":"קטגוריות";const grid=document.createElement("div");grid.style.cssText="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px";cats.forEach(x=>{const a=document.createElement("article");a.style.cssText="border:1px solid #e5e7eb;border-radius:12px;padding:12px;text-align:center";a.textContent=lang==="en"?(x.name_en||x.name_he):x.name_he;grid.append(a)});section.append(h,grid);host.append(section)}).catch(()=>{})}
Object.assign(I18N.en,{
"סניף איסוף חלופי":"Alternative pickup branch",
"אפשר להציע סניף אחר. ההחלפה תיכנס לתוקף רק לאחר אישור הצד השני.":"You can propose another branch. The change takes effect only after the other side approves.",
"הצעות קודמות":"Previous proposals",
"סניף חלופי":"Alternative branch",
"אישור":"Approve",
"דחייה":"Decline",
"בחירת סניף":"Choose branch",
"בחירת סניף חלופי":"Choose an alternative branch",
"שליחת הצעה":"Send proposal",
"אין כרגע סניף חלופי פעיל שאפשר להציע.":"There is currently no active alternative branch to propose.",
"עדיין לא הוצע סניף חלופי.":"No alternative branch has been proposed yet.",
"הצעת הסניף נשלחה לצד השני":"The branch proposal was sent to the other side",
"סניף האיסוף החלופי אושר":"The alternative pickup branch was approved",
"הצעת הסניף נדחתה":"The branch proposal was declined",
"מתחילים מכאן":"Start here",
"אפשר למצוא ציוד, לפרסם בקשת עזרה או לפתוח גמ\"ח ראשון.":"Find equipment, post a community request, or create your first gmach.",
"חיפוש ציוד":"Search equipment",
"פרסום בקשת עזרה":"Post a community request",
"גמ\"חים שנצפו לאחרונה":"Recently viewed gmachs",
"תיאום וציר זמן":"Coordination and timeline",
"הצעות איסוף":"Pickup proposals",
"עדיין לא הוצע חלון איסוף.":"No pickup window has been proposed yet.",
"הצעת חלון איסוף":"Propose pickup window",
"ציר זמן":"Timeline",
"אין אירועים עדיין.":"No events yet."
});
function init(){installLanguage();if(lang==="en")api("/api/categories?locale=en").then(data=>{for(const category of data.categories||[])if(category.name_en)I18N.en[category.name_he]=category.name_en;translate(document.body)}).catch(()=>{});installMapEntry();installImageEditor();installAdminRemaining();installA11y();const obs=new MutationObserver(()=>{enhanceItemDialog();enhanceOrganizationDialog();installCategoryButtons();renderOrgCategoryTiles();if(lang==="en")translate(document.body);installImageEditor()});obs.observe(document.body,{subtree:true,childList:true});enhanceItemDialog();enhanceOrganizationDialog();installCategoryButtons();renderOrgCategoryTiles()}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
