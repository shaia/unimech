/**
 * The exam formula sheet: a model of the two sheets (four A4 pages) a 77101 student may bring to the exam
 * (src/content/exam-map.yaml). Unlike /formulas/, which collects every <Formula> card of every lesson, this is a
 * selection that fits four printed pages, in the course's notation (the chapter summaries). The page
 * src/pages/formulas/sheet/ renders it; tests/e2e/formula-sheet.spec.ts prints it to A4 and fails above 4 pages.
 *
 * Every `tex` is display math and `label` is Hebrew text that may hold $inline$ math; both go through tex()
 * at build time, so a broken formula fails the build. No Hebrew inside math.
 */

export interface SheetItem {
  label: string;
  tex: string;
}
export interface SheetSection {
  id: string;
  title: string;
  items: SheetItem[];
}

const r = String.raw;

export const formulaSheet: SheetSection[] = [
  {
    id: 'math',
    title: 'כלים מתמטיים',
    items: [
      { label: 'טיילור, והפיתוחים סביב 0 (זווית ברדיאנים)', tex: r`f(x) \approx f(a) + f'(a)(x - a) + \tfrac12f''(a)(x - a)^2` },
      { label: '', tex: r`\sin x \approx x - \tfrac{x^3}{6} \quad \cos x \approx 1 - \tfrac{x^2}{2} \quad e^x \approx 1 + x + \tfrac{x^2}{2}` },
      { label: 'כש-$|x| \\ll 1$ (ובקירוב הבינומי גם $|nx| \\ll 1$)', tex: r`\ln(1 + x) \approx x - \tfrac{x^2}{2} \qquad (1 + x)^n \approx 1 + nx + \tfrac{n(n - 1)}{2}x^2` },
      { label: 'מכפלות של וקטורים', tex: r`\vec A\cdot\vec B = AB\cos\theta = A_xB_x + A_yB_y + A_zB_z \qquad |\vec A\times\vec B| = AB\sin\theta` },
      { label: '', tex: r`\vec A\times\vec B = \left(A_yB_z - A_zB_y,\ A_zB_x - A_xB_z,\ A_xB_y - A_yB_x\right)` },
      { label: 'מכפלות משולשות', tex: r`\vec A\cdot(\vec B\times\vec C) = \vec B\cdot(\vec C\times\vec A) \qquad \vec A\times(\vec B\times\vec C) = \vec B(\vec A\cdot\vec C) - \vec C(\vec A\cdot\vec B)` },
      { label: 'אוילר, והצגה קוטבית', tex: r`e^{i\varphi} = \cos\varphi + i\sin\varphi \qquad z = |z|e^{i\varphi} \qquad \operatorname{Re}\left(\tilde Xe^{i\omega t}\right) = |\tilde X|\cos(\omega t + \arg\tilde X)` },
      { label: 'פונקציות היפרבוליות', tex: r`\cosh^2x - \sinh^2x = 1 \qquad (\sinh x)' = \cosh x \qquad (\tanh x)' = \frac{1}{\cosh^2x}` },
      { label: 'הפרדת משתנים', tex: r`\frac{dy}{dt} = f(y)\,g(t) \;\Rightarrow\; \int_{y_0}^{y}\frac{dy'}{f(y')} = \int_{t_0}^{t}g\,dt'` },
      { label: 'מסדר שני, מקדמים קבועים: מנחשים $e^{st}$', tex: r`\ddot x + \gamma\dot x + \omega_0^2x = 0 \;\Rightarrow\; s = -\frac\gamma2 \pm \sqrt{\frac{\gamma^2}{4} - \omega_0^2} \qquad \ddot x = \kappa^2x \;\Rightarrow\; e^{\pm\kappa t}` },
      { label: 'אינטגרלים שימושיים', tex: r`\int\frac{dx}{a^2 + x^2} = \frac1a\arctan\frac xa \qquad \int\frac{dx}{\sqrt{a^2 - x^2}} = \arcsin\frac xa` },
      { label: '', tex: r`\int\frac{dx}{\sqrt{x^2 + a^2}} = \operatorname{arsinh}\frac xa \qquad \int\frac{x\,dx}{(x^2 + a^2)^{3/2}} = -\frac{1}{\sqrt{x^2 + a^2}}` },
      { label: '', tex: r`\int\frac{dx}{a^2 - x^2} = \frac1a\operatorname{artanh}\frac xa \qquad \int\sin^2x\,dx = \frac x2 - \frac{\sin2x}{4}` },
      { label: 'קוטביות: וקטורי היחידה, והגרדיאנט', tex: r`\dot{\hat r} = \dot\theta\,\hat\theta \qquad \dot{\hat\theta} = -\dot\theta\,\hat r \qquad \nabla U = \frac{\partial U}{\partial r}\hat r + \frac1r\frac{\partial U}{\partial\theta}\hat\theta` },
      { label: 'אלמנט נפח: גליליות $(s, \\varphi, z)$ וכדוריות $(r, \\theta, \\varphi)$', tex: r`dV = s\,ds\,d\varphi\,dz \qquad dV = r^2\sin\theta\,dr\,d\theta\,d\varphi` },
    ],
  },
  {
    id: 'kinematics',
    title: 'קינמטיקה',
    items: [
      { label: 'תאוצה קבועה', tex: r`\vec v = \vec v_0 + \vec at \qquad \vec r = \vec r_0 + \vec v_0t + \tfrac12\vec at^2 \qquad v^2 = v_0^2 + 2\vec a\cdot\Delta\vec r` },
      { label: 'זריקה על קרקע מישורית', tex: r`T = \frac{2v_0\sin\theta}{g} \qquad H = \frac{v_0^2\sin^2\theta}{2g} \qquad R = \frac{v_0^2\sin2\theta}{g}` },
      { label: 'תאוצה משיקית ונורמלית, ורדיוס העקמומיות', tex: r`\vec a = \frac{dv}{dt}\,\hat T + \frac{v^2}{\rho}\,\hat N \qquad \rho = \frac{v^3}{|\vec v\times\vec a|} \qquad a = v\frac{dv}{dx}` },
      { label: 'קואורדינטות קוטביות', tex: r`\vec v = \dot r\,\hat r + r\dot\theta\,\hat\theta \qquad \vec a = \left(\ddot r - r\dot\theta^2\right)\hat r + \left(r\ddot\theta + 2\dot r\dot\theta\right)\hat\theta` },
      { label: 'גליליי, $\\vec V$ קבועה', tex: r`\vec r\,' = \vec r - \vec Vt \qquad \vec v\,' = \vec v - \vec V \qquad \vec a\,' = \vec a` },
    ],
  },
  {
    id: 'newton',
    title: 'חוקי ניוטון',
    items: [
      { label: 'החוק השני (מערכת אינרציאלית) והשלישי', tex: r`\sum\vec F = m\vec a = \frac{d\vec p}{dt} \qquad \vec F_{AB} = -\vec F_{BA}` },
      { label: 'קפיצים וחיכוך', tex: r`F = -kx \quad k_{\parallel} = k_1 + k_2 \quad \frac1{k_{\text{series}}} = \frac1{k_1} + \frac1{k_2} \quad |f_s| \le \mu_sN \quad f_k = \mu_kN` },
      { label: 'מכונת אטווד; גלגלת נעה', tex: r`a = \frac{m_2 - m_1}{m_1 + m_2}\,g \qquad y_1 + 2y_2 = \text{const} \;\Rightarrow\; a_1 = -2a_2` },
      { label: 'במעגל: הכוח השקול הרדיאלי; חוט בראש מעגל אנכי', tex: r`\sum F_r = \frac{mv^2}{R} \qquad \sum F_t = m\frac{dv}{dt} \qquad v_{\text{top}} \ge \sqrt{gR}` },
      { label: 'כביש משופע בזווית $\\theta$ בלי חיכוך; מטוטלת קונית באורך $L$', tex: r`v_0^2 = gR\tan\theta \qquad \cos\theta = \frac{g}{\omega^2L}` },
      { label: 'גרר ליניארי (ציר כלפי מטה)', tex: r`m\dot v = mg - bv \qquad v = v_t + (v_0 - v_t)e^{-t/\tau} \qquad v_t = \frac{mg}{b} \qquad \tau = \frac mb` },
      { label: 'גרר ריבועי, נפילה ממנוחה', tex: r`m\dot v = mg - cv^2 \qquad v_t = \sqrt{\frac{mg}{c}} \qquad v = v_t\tanh\frac{gt}{v_t}` },
      { label: 'כוח שתלוי במקום', tex: r`\tfrac12mv^2 - \tfrac12mv_0^2 = \int_{x_0}^{x}F\,dx' \qquad t = \int\frac{dx}{|v(x)|}` },
    ],
  },
  {
    id: 'conservation',
    title: 'חוקי שימור',
    items: [
      { label: 'עבודה, אנרגיה והספק', tex: r`W = \int\vec F\cdot d\vec r \qquad W_{\text{net}} = \Delta K \qquad W_{\text{nc}} = \Delta E \qquad P = \vec F\cdot\vec v` },
      { label: 'כוח משמר (בתחום בלי חורים)', tex: r`\vec F = -\nabla U \;\Leftrightarrow\; \nabla\times\vec F = 0 \;\Leftrightarrow\; \oint\vec F\cdot d\vec r = 0 \qquad U(\vec r) = U(\vec r_0) - \int_{\vec r_0}^{\vec r}\vec F\cdot d\vec r\,'` },
      { label: 'שיווי משקל: יציב כש-$U\'\' > 0$', tex: r`U'(x_{\text{eq}}) = 0 \qquad |v(x)| = \sqrt{\frac{2\left(E - U(x)\right)}{m}}` },
      { label: 'מרכז המסה, ותנע של מערכת', tex: r`\vec R_{\text{cm}} = \frac1M\int\vec r\,dm \qquad M\vec a_{\text{cm}} = \vec F_{\text{ext}} \qquad \vec P = M\vec v_{\text{cm}}` },
      { label: 'מתקף', tex: r`\vec J = \int\vec F\,dt = \Delta\vec p` },
      { label: 'רקטה בלי כוח חיצוני ($u$ ביחס לרקטה); מסה משתנה ($w$ מהירות המסה שנכנסת או יוצאת)', tex: r`v - v_0 = u\ln\frac{m_0}{M} \qquad M\frac{dv}{dt} = F + (w - v)\frac{dM}{dt}` },
      { label: 'רקטה שעולה בשדה אחיד ממנוחה, $\\mu$ קצב פליטת המסה', tex: r`M\frac{dv}{dt} = u\mu - Mg \qquad v = u\ln\frac{m_0}{M} - gt` },
      { label: 'תנע זוויתי ומומנט ביחס לנקודה קבועה $O$', tex: r`\vec L_O = \vec r\times\vec p \qquad \vec\tau_O = \vec r\times\vec F \qquad \frac{d\vec L_O}{dt} = \vec\tau_O \qquad \frac{dA}{dt} = \frac{L}{2m}` },
      { label: 'משפט קניג, ושני חלקיקים', tex: r`\vec L_O = \vec R\times M\vec V + \vec L_{\text{rel}} \qquad K = \tfrac12MV^2 + K_{\text{rel}} \qquad \mu = \frac{m_1m_2}{m_1 + m_2}` },
      { label: 'ביחס למרכז המסה, גם כשהוא מואץ', tex: r`\frac{d\vec L_{\text{rel}}}{dt} = \vec\tau_{\text{cm}}` },
    ],
  },
  {
    id: 'collisions',
    title: 'התנגשויות',
    items: [
      { label: 'מקדם התקומה, בממד אחד', tex: r`m_1v_1 + m_2v_2 = m_1v_1' + m_2v_2' \qquad v_2' - v_1' = e\,(v_1 - v_2)` },
      { label: 'אלסטית', tex: r`v_1' = \frac{(m_1 - m_2)v_1 + 2m_2v_2}{m_1 + m_2} \qquad v_2' = \frac{(m_2 - m_1)v_2 + 2m_1v_1}{m_1 + m_2}` },
      { label: 'מערכת מרכז המסה', tex: r`V = \frac{P}{M} \qquad u_i = v_i - V \qquad u_i' = -e\,u_i \qquad K = \tfrac12MV^2 + \tfrac12\mu v_{\text{rel}}^2` },
      { label: 'האנרגיה שאובדת', tex: r`K_{\text{lost}} = \tfrac12\mu v_{\text{rel}}^2\left(1 - e^2\right)` },
      { label: 'אלסטית, מטרה במנוחה: מסות שוות; וזווית הפיזור המרבית כש-$m_1 > m_2$', tex: r`\vec p_1'\cdot\vec p_2' = 0 \qquad \sin\theta_{\max} = \frac{m_2}{m_1}` },
      { label: 'דיסקיות חלקות, מטרה במנוחה: המתקף לאורך קו המרכזים ($b$ פרמטר הפגיעה, $D$ המרחק בין המרכזים במגע)', tex: r`J = (1 + e)\,\mu v\cos\varphi \qquad \sin\varphi = \frac bD` },
    ],
  },
  {
    id: 'oscillator',
    title: 'המתנד ההרמוני',
    items: [
      { label: 'תנודה הרמונית פשוטה', tex: r`\ddot x = -\omega_0^2x \qquad x = x_0\cos\omega_0t + \frac{v_0}{\omega_0}\sin\omega_0t \qquad A = \sqrt{x_0^2 + \frac{v_0^2}{\omega_0^2}}` },
      { label: 'אנרגיה; קירוב הרמוני; שיטת האנרגיה', tex: r`E = \tfrac12kA^2 \qquad \omega_0^2 = \frac{U''(x_{\text{eq}})}{m} \qquad E = \tfrac12m_{\text{eff}}\dot q^2 + \tfrac12k_{\text{eff}}q^2 \;\Rightarrow\; \omega_0^2 = \frac{k_{\text{eff}}}{m_{\text{eff}}}` },
      { label: 'מטוטלת, ומטוטלת בזווית לא קטנה', tex: r`\omega_0^2 = \frac gL \qquad T \approx T_0\left(1 + \frac{\theta_0^2}{16}\right)` },
      { label: 'ריסון: $\\gamma = b/m$', tex: r`\ddot x + \gamma\dot x + \omega_0^2x = 0 \qquad x = A_0e^{-\gamma t/2}\cos(\omega_dt + \varphi) \qquad \omega_d = \sqrt{\omega_0^2 - \tfrac{\gamma^2}{4}}` },
      { label: 'ריסון קריטי $\\gamma = 2\\omega_0$; על-ריסון: שני אקספוננטים', tex: r`x = (C_1 + C_2t)e^{-\omega_0t} \qquad x = C_1e^{s_1t} + C_2e^{s_2t}` },
      { label: 'ריסון חלש: האנרגיה, $Q$ והדקרמנט', tex: r`E \approx E_0e^{-\gamma t} \qquad Q = \frac{\omega_0}{\gamma} \qquad \frac{\Delta E}{E} \approx \frac{2\pi}{Q} \qquad \Lambda = \frac{\gamma T_d}{2} \approx \frac{\pi}{Q}` },
      { label: 'מתנד מאולץ, המצב היציב; $\\delta$ הפיגור', tex: r`\ddot x + \gamma\dot x + \omega_0^2x = \frac{F_0}{m}\cos\omega t \qquad x_p = A\cos(\omega t - \delta)` },
      { label: '', tex: r`A = \frac{F_0/m}{\sqrt{(\omega_0^2 - \omega^2)^2 + \gamma^2\omega^2}} \qquad \tan\delta = \frac{\gamma\omega}{\omega_0^2 - \omega^2} \qquad A(\omega_0) = Q\frac{F_0}{k}` },
      { label: 'ההספק הממוצע ורוחב התהודה; שיא האמפליטודה', tex: r`\bar P = \tfrac12m\gamma\omega^2A^2 \qquad \Delta\omega = \gamma \qquad \omega_{\max} = \sqrt{\omega_0^2 - \tfrac{\gamma^2}{2}}` },
      { label: 'פתרון כללי = מצב יציב + פתרון הומוגני', tex: r`x(t) = x_p(t) + x_h(t)` },
      { label: 'מתנדים מצומדים: אופני תנודה; שני גופים זהים, $k_c$ קפיץ הצימוד', tex: r`\det\left(\mathbf K - \omega^2\mathbf M\right) = 0 \qquad \omega_1 = \sqrt{\frac km}\;(1, 1) \qquad \omega_2 = \sqrt{\frac{k + 2k_c}{m}}\;(1, -1)` },
      { label: 'פעימות', tex: r`\cos\omega_1t + \cos\omega_2t = 2\cos\frac{(\omega_1 - \omega_2)t}{2}\cos\frac{(\omega_1 + \omega_2)t}{2}` },
    ],
  },
  {
    id: 'gravity',
    title: 'כבידה והבעיה הדו-גופית',
    items: [
      { label: 'כבידה (האפס באינסוף); משפט הקליפה', tex: r`F = \frac{Gm_1m_2}{r^2} \qquad U = -\frac{Gm_1m_2}{r} \qquad g(r) = \frac{GM(r)}{r^2}` },
      { label: 'כדור אחיד, מבפנים', tex: r`\vec g = -\frac{GM}{R^3}\vec r \qquad U(r) = -\frac{GMm\left(3R^2 - r^2\right)}{2R^3}` },
      { label: 'משני גופים לאחד, במערכת מרכז המסה: $\\vec r = \\vec r_1 - \\vec r_2$, $M = m_1 + m_2$', tex: r`\mu\ddot{\vec r} = \vec F \qquad \vec r_1 = \frac{m_2}{M}\vec r \qquad \vec r_2 = -\frac{m_1}{M}\vec r` },
      { label: 'כוח מרכזי: הפוטנציאל האפקטיבי', tex: r`L = \mu r^2\dot\theta \qquad E = \tfrac12\mu\dot r^2 + \frac{L^2}{2\mu r^2} + U(r)` },
      { label: 'ליחידת מסה ($h$, $\\varepsilon$), בכבידה; $r_0$ רדיוס המסלול המעגלי', tex: r`\varepsilon = \tfrac12\dot r^2 + \frac{h^2}{2r^2} - \frac{GM}{r} \qquad r_0 = \frac{h^2}{GM}` },
      { label: 'משוואת המסלול, $u = 1/r$, $F$ הרכיב הרדיאלי (במשיכה $F < 0$); $\\theta$ מנקודת הקרבה', tex: r`\frac{d^2u}{d\theta^2} + u = -\frac{\mu}{L^2u^2}\,F\!\left(\frac1u\right) \qquad r = \frac{p}{1 + e\cos\theta}` },
      { label: 'חתכי חרוט ($k = Gm_1m_2$)', tex: r`p = \frac{L^2}{\mu k} = \frac{h^2}{GM} \qquad e^2 = 1 + \frac{2\varepsilon h^2}{(GM)^2} \qquad a = -\frac{GM}{2\varepsilon} = \frac{p}{1 - e^2}` },
      { label: 'אליפסה; ובהיפרבולה, כיוון האסימפטוטות', tex: r`r_{p,a} = a(1 \mp e) \qquad b = a\sqrt{1 - e^2} \qquad r_pv_p = r_av_a \qquad \cos\theta_\infty = -\frac1e` },
      { label: 'קפלר 3, ו-vis-viva', tex: r`T^2 = \frac{4\pi^2a^3}{G(m_1 + m_2)} \qquad v^2 = GM\left(\frac2r - \frac1a\right) \qquad E = -\frac{Gm_1m_2}{2a}` },
      { label: 'מהירות מעגלית ומהירות מילוט', tex: r`v_c = \sqrt{\frac{GM}{r}} \qquad v_{\text{esc}} = \sqrt{\frac{2GM}{r}} \qquad v_\infty^2 = v^2 - v_{\text{esc}}^2` },
      { label: 'הוהמן מ-$r_1$ ל-$r_2$ ($v_1$, $v_2$ המהירויות המעגליות, $a_t = (r_1 + r_2)/2$)', tex: r`\Delta v_1 = v_1\left(\sqrt{\frac{2r_2}{r_1 + r_2}} - 1\right) \qquad \Delta v_2 = v_2\left(1 - \sqrt{\frac{2r_1}{r_1 + r_2}}\right) \qquad t_H = \pi\sqrt{\frac{a_t^3}{GM}}` },
    ],
  },
  {
    id: 'frames',
    title: 'מערכות ייחוס לא-אינרציאליות',
    items: [
      { label: 'קצב השינוי של וקטור', tex: r`\left(\frac{d\vec Q}{dt}\right)_{\text{in}} = \left(\frac{d\vec Q}{dt}\right)_{\text{rot}} + \vec\omega\times\vec Q` },
      { label: 'החוק השני במערכת $S\'$', tex: r`m\vec a\,' = \vec F - m\vec A - m\vec\omega\times(\vec\omega\times\vec r\,') - 2m\vec\omega\times\vec v\,' - m\dot{\vec\omega}\times\vec r\,'` },
      { label: 'תאוצה קווית $\\vec A$', tex: r`\vec F_{\text{fict}} = -m\vec A \qquad \vec g_{\text{eff}} = \vec g - \vec A \qquad T_0 = 2\pi\sqrt{\frac{L}{g_{\text{eff}}}}` },
      { label: 'מסתובבת: הכוח הצנטריפוגלי והאנרגיה הפוטנציאלית שלו; שימור ב-$S\'$ כשאף כוח אמיתי לא עושה עבודה', tex: r`\vec F_{\text{cf}} = m\omega^2\rho\,\hat\rho \qquad U_{\text{cf}} = -\tfrac12m\omega^2\rho^2 \qquad \tfrac12mv'^2 - \tfrac12m\omega^2\rho^2 = \text{const}` },
      { label: 'פני מים מסתובבים', tex: r`z(r) = z_0 + \frac{\omega^2r^2}{2g}` },
      { label: 'כדור הארץ, קו רוחב $\\lambda$ ($\\hat n$ צפונה, $\\hat u$ מעלה); $\\alpha$ נטיית האנך', tex: r`\vec\omega = \omega\cos\lambda\,\hat n + \omega\sin\lambda\,\hat u \qquad \alpha \approx \frac{\omega^2R}{2g}\sin2\lambda` },
      { label: 'הרכיב האופקי של כוח קוריוליס', tex: r`\vec F_{\text{cor},\parallel} = -2m\omega\sin\lambda\,\hat u\times\vec v\,'` },
      { label: 'הסטה מזרחה; מטוטלת פוקו', tex: r`d = \tfrac13\omega gt^3\cos\lambda \qquad T_{\text{plane}} = \frac{2\pi}{\omega|\sin\lambda|}` },
    ],
  },
  {
    id: 'rigid',
    title: 'הגוף הצפיד',
    items: [
      { label: 'קינמטיקה (התאוצה: בתנועה במישור)', tex: r`\vec v_P = \vec v_{\text{cm}} + \vec\omega\times\vec r \qquad \vec a_P = \vec a_{\text{cm}} + \vec\alpha\times\vec r - \omega^2\vec r` },
      { label: 'מומנט התמד סביב ציר במרכז המסה: מוט (ניצב לו), טבעת ודסקה (ציר הסימטריה), כדור מלא, קליפה כדורית', tex: r`\tfrac1{12}ML^2 \qquad MR^2 \qquad \tfrac12MR^2 \qquad \tfrac25MR^2 \qquad \tfrac23MR^2` },
      { label: 'לוח $a \\times b$ (ציר ניצב ללוח); גליל מלא סביב קוטר במרכזו; מוט סביב הקצה', tex: r`\tfrac1{12}M(a^2 + b^2) \qquad M\left(\frac{R^2}{4} + \frac{L^2}{12}\right) \qquad \tfrac13ML^2` },
      { label: 'צירים מקבילים; צירים ניצבים (גוף שטוח)', tex: r`I = I_{\text{cm}} + Md^2 \qquad I_z = I_x + I_y` },
      { label: 'סביב ציר קבוע', tex: r`\tau_z = I\alpha \qquad L_z = I\omega \qquad K = \tfrac12I\omega^2 \qquad P = \tau\omega \qquad K = \frac{L^2}{2I}` },
      { label: 'מכונת אטווד עם גלגלת בעלת מסה ($m_1$ הכבדה)', tex: r`a = \frac{(m_1 - m_2)g}{m_1 + m_2 + I/R^2} \qquad T_1 - T_2 = \frac{I}{R^2}a` },
      { label: 'גלגול בלי החלקה; $\\beta = I_{\\text{cm}}/(mR^2)$', tex: r`v = \omega R \qquad a = \frac{g\sin\theta}{1 + \beta} \qquad K = \tfrac12(1 + \beta)mv^2 \qquad \mu_s \ge \frac{\beta\tan\theta}{1 + \beta}` },
      { label: 'החלקה עד גלגול: התנע הזוויתי סביב נקודה $Q$ על הרצפה נשמר', tex: r`u = v - \omega R \qquad L_Q = mR\left(v + \beta\omega R\right) \qquad t_{\text{roll}} = \frac{\beta u_0}{\mu_kg(1 + \beta)}` },
      { label: 'שיווי משקל; מעבר נקודה', tex: r`\sum\vec F = 0 \qquad \sum\vec\tau = 0 \qquad \vec\tau_B = \vec\tau_A + (\vec r_A - \vec r_B)\times\sum\vec F` },
      { label: 'מטוטלת פיזיקלית; $I_{\\text{cm}} = mk^2$', tex: r`T_0 = 2\pi\sqrt{\frac{I_P}{mgd}} \qquad \ell = d + \frac{k^2}{d} \qquad d_1d_2 = k^2` },
      { label: 'מכה במרחק $b$ מהציר: מרכז ההקשה כש-$J_P = 0$', tex: r`I_P\omega = Jb \qquad J_P = J\left(\frac{mdb}{I_P} - 1\right) \qquad b = \frac{I_P}{md}` },
      { label: 'טנזור ההתמד', tex: r`\vec L = \mathbf I\vec\omega \qquad I_{xx} = \sum m(y^2 + z^2) \qquad I_{xy} = -\sum mxy` },
      { label: 'צירים ראשיים; סיבוב בקצב קבוע', tex: r`\det(\mathbf I - \lambda\mathbf 1) = 0 \qquad \vec L = (I_1\omega_1, I_2\omega_2, I_3\omega_3) \qquad \vec\tau = \vec\omega\times\vec L` },
      { label: 'סביבון מהיר: קצב הנקיפה', tex: r`\vec L \approx I_3\omega_3\hat e_3 \qquad \Omega = \frac{Mgd}{I_3\omega_3}` },
    ],
  },
  {
    id: 'sr-kinematics',
    title: 'יחסות: קינמטיקה',
    items: [
      { label: '$S\'$ נעה ב-$+v$ לאורך $x$', tex: r`\gamma = \frac{1}{\sqrt{1 - \beta^2}} \qquad \beta = \frac vc \qquad \gamma \approx 1 + \frac{\beta^2}{2}` },
      { label: 'טרנספורמציית לורנץ (ההפוכה: $v \\to -v$)', tex: r`x' = \gamma(x - vt) \qquad t' = \gamma\left(t - \frac{vx}{c^2}\right) \qquad y' = y \qquad z' = z` },
      { label: 'זמן עצמי $\\Delta\\tau$; אורך עצמי $L_0$', tex: r`\Delta t = \gamma\Delta\tau \qquad L = \frac{L_0}{\gamma} \qquad \Delta t' = -\gamma\frac{v\Delta x}{c^2}\;\;(\Delta t = 0)` },
      { label: 'חיבור מהירויות, מ-$S\'$ ל-$S$', tex: r`u_x = \frac{u'_x + v}{1 + u'_xv/c^2} \qquad u_y = \frac{u'_y}{\gamma\left(1 + u'_xv/c^2\right)}` },
      { label: 'אברציה (אור בזווית $\\theta\'$ ב-$S\'$); דופלר לאורך קו הראייה ($\\beta > 0$ בהתקרבות)', tex: r`\cos\theta = \frac{\cos\theta' + \beta}{1 + \beta\cos\theta'} \qquad f = f_0\sqrt{\frac{1 + \beta}{1 - \beta}}` },
      { label: 'האינטרוול; זמן עצמי לאורך קו עולם', tex: r`s^2 = c^2\Delta t^2 - \Delta x^2 \qquad \tau = \int\sqrt{1 - \frac{v^2}{c^2}}\,dt` },
      { label: 'מינקובסקי: ציר $ct\'$, ציר $x\'$, והשנתה $ct\' = 1$', tex: r`x = \beta ct \qquad ct = \beta x \qquad (x, ct) = (\gamma\beta, \gamma)` },
    ],
  },
  {
    id: 'sr-dynamics',
    title: 'יחסות: דינמיקה',
    items: [
      { label: 'תנע ואנרגיה', tex: r`\vec p = \gamma m\vec v \qquad E = \gamma mc^2 = mc^2 + K \qquad E^2 = (pc)^2 + (mc^2)^2 \qquad \beta = \frac{pc}{E}` },
      { label: 'ארבעה-וקטורים; $A\\cdot B$ אינווריאנטי', tex: r`P = \left(\frac Ec, \vec p\right) \qquad A\cdot B = A_0B_0 - \vec A\cdot\vec B \qquad A'_0 = \gamma(A_0 - \beta A_1) \quad A'_1 = \gamma(A_1 - \beta A_0)` },
      { label: 'מסה אינווריאנטית ומהירות מרכז המסה; שני פוטונים בזווית $\\theta$', tex: r`(Mc^2)^2 = E_{\text{tot}}^2 - (p_{\text{tot}}c)^2 \qquad \beta_{\text{cm}} = \frac{p_{\text{tot}}c}{E_{\text{tot}}} \qquad (Mc^2)^2 = 2E_1E_2(1 - \cos\theta)` },
      { label: 'מטרה נייחת $m_2$: $\\sqrt s$ האנרגיה במערכת מרכז המסה; אנרגיית הסף', tex: r`s = (m_1c^2)^2 + (m_2c^2)^2 + 2E_1m_2c^2 \qquad K_{\text{th}} = \frac{\left(\sum m_f\right)^2 - (m_1 + m_2)^2}{2m_2}c^2` },
      { label: 'דעיכה לשני חלקיקים, במערכת המנוחה', tex: r`E_1 = \frac{M^2 + m_1^2 - m_2^2}{2M}c^2 \qquad E_1 = \frac{Mc^2}{2}\;\;(m_1 = m_2 = 0)` },
      { label: 'התנע של כל תוצר בדעיכה לשני חלקיקים, במערכת המנוחה', tex: r`pc = \frac{\sqrt{\left[M^2 - (m_1 + m_2)^2\right]\left[M^2 - (m_1 - m_2)^2\right]}}{2M}\,c^2` },
      { label: 'פוטון; קומפטון; לחץ קרינה של קרן בעוצמה $I$ על משטח בולע ועל מראה', tex: r`E = pc = hf \qquad p = \frac h\lambda \qquad \lambda' - \lambda = \frac{h}{m_ec}(1 - \cos\theta) \qquad \frac Ic \qquad \frac{2I}{c}` },
      { label: 'אנרגיית קשר; האנרגיה שמשתחררת', tex: r`B = \left(\sum m_i - M\right)c^2 \qquad Q = \sum m_ic^2 - \sum m_fc^2` },
      { label: 'כוח', tex: r`\vec F = \frac{d\vec p}{dt} \qquad \frac{dE}{dt} = \vec F\cdot\vec v \qquad a_\parallel = \frac{F}{\gamma^3m} \qquad a_\perp = \frac{F}{\gamma m}` },
      { label: 'כוח קבוע ממנוחה', tex: r`p = Ft \qquad (x + L)^2 - (ct)^2 = L^2 \qquad L = \frac{mc^2}{F} \qquad \tau = \frac{mc}{F}\operatorname{arsinh}\frac{Ft}{mc}` },
    ],
  },
  {
    id: 'constants',
    title: 'קבועים (במבחן כל מספר נתון בשאלה)',
    items: [
      { label: '', tex: r`g = 9.8\ \tfrac{\text{m}}{\text{s}^2} \quad G = 6.67\times10^{-11}\ \tfrac{\text{N m}^2}{\text{kg}^2} \quad c = 3.0\times10^{8}\ \tfrac{\text{m}}{\text{s}} \quad h = 6.63\times10^{-34}\ \text{J s}` },
      { label: '', tex: r`e = 1.6\times10^{-19}\ \text{C} \quad m_e = 9.11\times10^{-31}\ \text{kg} \quad m_p = 1.67\times10^{-27}\ \text{kg} \quad 1\ \text{eV} = 1.6\times10^{-19}\ \text{J}` },
      { label: '', tex: r`M_E = 5.97\times10^{24}\ \text{kg} \quad R_E = 6.37\times10^{6}\ \text{m} \quad \omega_E = 7.29\times10^{-5}\ \tfrac{\text{rad}}{\text{s}}` },
      { label: '', tex: r`M_{\odot} = 1.99\times10^{30}\ \text{kg} \quad 1\ \text{AU} = 1.5\times10^{11}\ \text{m} \quad 1\ \text{yr} = 3.156\times10^{7}\ \text{s}` },
    ],
  },
];
