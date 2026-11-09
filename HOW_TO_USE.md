# AllergenGuard 10.2

English and Vietnamese food-allergen screening by Aditya Rai & Team.

Live app: https://arai33760-afk.github.io/AI-Allergen-Detector/

## Try on Android

1. Open the link in Chrome and choose English or Tiếng Việt.
2. Open Allergy profile. Select a group or individual food; milk reveals casein and whey components. Set record status and optional reaction notes, then save.
3. Choose Ingredient label for a label, or Menu / dish for a dish name. Paste text and check it against your profile. The example button provides fictional sample text.
4. For food photos, open **Scan a food or label photo**, choose an image, then tap **Recognize dish**. AI suggests up to three broad food categories and screens the first against your profile. Confirm or correct the exact dish name, such as **Bánh mì**, then tap **Use this dish & check my profile**. The local menu vocabulary includes Indian and Vietnamese dishes.
5. For labels or printed menus, expand **Read label text**, choose the printed language, extract text, correct errors, and confirm it against the original before checking. Choose **Menu / dish** if the text is a menu rather than an ingredient list.

Photo recognition uses MobileNet v2 (full-width model, five candidate classes) on your device. It may recognize a sandwich or bread without identifying a specific regional recipe. Photo suggestions and recipe ingredients remain unconfirmed. It cannot see hidden ingredients or cross-contact. Unrecognized photos prompt for a dish name instead of producing a fabricated match. Recognition can be cancelled and retried. The model is released after one idle minute; a quick repeat scan reuses it.

Chrome can add a home-screen shortcut. Core text screening works offline after a successful online visit caches the app files. Optional OCR and image models need downloads. This is a web app, not a native APK.

## Tiếng Việt

Chọn Tiếng Việt, mở Hồ sơ dị ứng, chọn nhóm hoặc từng thực phẩm phù hợp với tiền sử, rồi lưu. Chọn Nhãn thành phần khi đọc nhãn, hoặc Thực đơn / món ăn khi chỉ có tên món. Khi dùng ảnh, đối chiếu và sửa chữ nhận dạng với nhãn gốc trước khi kiểm tra.

## Scope

32 food groups and 100 individual foods, plus custom entries. The list includes Vietnamese seafood, sauces, plant foods, fruits and meats; it is not exhaustive.

Named label sources, precautionary statements, ambiguous names and unconfirmed recipe suggestions have separate evidence labels. A negative match does not establish safety. Components are source-linked references, not measurements or diagnoses. Selecting a component does not establish tolerance to others. Lactose intolerance, coeliac disease and sulfite sensitivity are distinguished from food-protein allergy. The app has not undergone clinical validation.

## Privacy and records

Profiles, notes and the 50 latest checks stay in this browser; photos are processed locally. Optional model downloads contact external CDNs. Other people using the same browser profile may access its records. Download a JSON backup before clearing browser data. CSV and browser printing/PDF are available. Saved checks retain the original profile but are re-screened with the current catalogue when opened.

## References

- WHO/IUIS nomenclature: https://www.allergen.org/
- Milk caseins: https://www.allergen.org/viewallergen.php?aid=166
- EAACI diagnosis guidance: https://eaaci.org/guidelines-position-papers/eaaci-guidelines-on-the-diagnosis-of-ige-mediated-food-allergy/
- FDA labeling explanation (US guidance): https://www.fda.gov/food/nutrition-food-labeling-and-critical-foods/food-allergies
- Vietnamese adult survey: https://www.worldallergyorganizationjournal.org/article/S1939-4551(20)30005-3/fulltext

The original molecular database is retained as reference data. The application catalogue corrects milk/egg mappings; the imported database is not independently clinically validated.

## Development and validation

No build step. Open index.html for text screening, or run node serve.cjs and visit http://127.0.0.1:8765.

Run `node tests/engine.test.cjs`, `node tests/vision.test.cjs` and `node tests/app.test.cjs`. Checks cover ingredient screening, food-class mapping, model cleanup, profile creation, photo-to-result wiring, cancellation, failures, and label OCR confirmation. The DOM tests use an adapter with mocked model predictions, not a visual browser or physical Android. They verify application behavior, not recognition accuracy. Camera behavior, image/OCR accuracy and clinical suitability still require user evaluation.
