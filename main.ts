/**
 * Polskie rozszerzenie RoboEyes dla MakeCode micro:bit.
 * Port oryginalnej biblioteki micropython-roboeyes (mchobby) z wbudowanym niezależnym sterownikiem OLED SSD1306.
 */
//% color="#00BCD4" icon="\uf11a" block="RoboEyes"
//% groups="['Konfiguracja', 'Sterowanie Oczami', 'Animacje i Pozycja']"
namespace roboeyes {
    // Adres I2C ekranu SSD1306 (standardowo 0x3C)
    const SSD1306_I2C_ADDR = 0x3c;

    // Bufor ekranu 128x64 pikseli (8 stron po 128 bajtów = 1024 bajty)
    let screenBuffer = pins.createBuffer(1024);

    // Parametry fizyczne oczu (zgodnie z projektem mchobby)
    let eyeWidth = 24;
    let eyeHeight = 32;
    let eyeSpacing = 24;
    
    // Bieżący offset spojrzenia (rozglądanie się)
    let gazeX = 0;
    let gazeY = 0;
    
    // Parametry animacji mrugania
    let isBlinking = false;
    let autoBlinkEnabled = false;
    let lastBlinkTime = 0;
    let currentMood = "normal";

    // --- SEKCJA 1: WEWNĘTRZNY STEROWNIK OLED SSD1306 ---

    function writeCommand(cmd: number): void {
        let buf = pins.createBuffer(2);
        buf[0] = 0x00; // Co = 0, D/C# = 0 -> Tryb wysyłania komend
        buf[1] = cmd;
        pins.i2cWriteBuffer(SSD1306_I2C_ADDR, buf);
    }

    /**
     * Inicjalizuje ekran OLED w trybie adresowania stron, optymalnym dla micro:bita.
     */
    function initOLED(): void {
        let initCmds = [
            0xAE, // Wyłącz ekran
            0xD5, 0x80, // Ustaw zegar podziału częstotliwości
            0xA8, 0x3F, // Ustaw współczynnik multipleksowania (1-64)
            0xD3, 0x00, // Brak przesunięcia wyświetlacza (offset = 0)
            0x40, // Linia startowa = 0
            0x8D, 0x14, // Włącz wbudowaną pompę ładunku (Charge Pump)
            0x20, 0x02, // Ustaw tryb adresowania: Page Addressing Mode
            0xA1, // Odwrócenie poziome (Segment Re-map)
            0xC8, // Odwrócenie pionowe (COM Output Scan Direction)
            0xDA, 0x12, // Konfiguracja pinów COM
            0x81, 0xCF, // Kontrast (0xCF)
            0xD9, 0xF1, // Okres pre-charge
            0xDB, 0x40, // Poziom odniesienia napięcia VCOMH
            0xA4, // Wyświetl zawartość RAMu GDDRAM
            0xA6, // Tryb wyświetlania: normalny (nieodwrócony)
            0xAF  // Włącz ekran
        ];

        for (let i = 0; i < initCmds.length; i++) {
            writeCommand(initCmds[i]);
        }
        clear();
        update();
    }

    /**
     * Przesyła lokalny bufor pamięci RAM bezpośrednio do kontrolera SSD1306 przez magistralę I2C.
     */
    //% block="Odśwież ekran"
    //% group="Konfiguracja"
    //% weight=90
    export function update(): void {
        // Zapisujemy bufor strona po stronie (8 stron, każda po 128 kolumn)
        for (let page = 0; page < 8; page++) {
            writeCommand(0xB0 + page); // Ustaw stronę (0xB0 do 0xB7)
            writeCommand(0x00);        // Ustaw dolny adres kolumny na 0
            writeCommand(0x10);        // Ustaw górny adres kolumny na 0

            // Budujemy bufor: 1 bajt kontrolny (0x40 dla danych) + 128 bajtów danych dla danej strony
            let pageBuf = pins.createBuffer(129);
            pageBuf[0] = 0x40;
            for (let col = 0; col < 128; col++) {
                pageBuf[col + 1] = screenBuffer[page * 128 + col];
            }
            pins.i2cWriteBuffer(SSD1306_I2C_ADDR, pageBuf);
        }
    }

    /**
     * Czyści bufor w pamięci (oraz opcjonalnie natychmiast aktualizuje ekran).
     */
    //% block="Wyczyść bufor"
    //% group="Konfiguracja"
    //% weight=85
    export function clear(): void {
        screenBuffer.fill(0);
    }

    // --- SEKCJA 2: FUNKCJE RYSOWANIA PIKSELI I KSZTAŁTÓW (Bresenham) ---

    function setPixel(x: number, y: number, color: number): void {
        if (x < 0 || x >= 128 || y < 0 || y >= 64) return;
        let index = x + ((y >> 3) * 128);
        if (color == 1) {
            screenBuffer[index] |= (1 << (y & 7));
        } else {
            screenBuffer[index] &= ~(1 << (y & 7));
        }
    }

    function drawLine(x0: number, y0: number, x1: number, y1: number, color: number): void {
        let dx = Math.abs(x1 - x0);
        let dy = Math.abs(y1 - y0);
        let sx = (x0 < x1) ? 1 : -1;
        let sy = (y0 < y1) ? 1 : -1;
        let err = dx - dy;

        while (true) {
            setPixel(x0, y0, color);
            if (x0 == x1 && y0 == y1) break;
            let e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x0 += sx;
            }
            if (e2 < dx) {
                err += dx;
                y0 += sy;
            }
        }
    }

    function drawRect(x: number, y: number, w: number, h: number, fill: boolean, color: number): void {
        if (fill) {
            for (let i = x; i < x + w; i++) {
                for (let j = y; j < y + h; j++) {
                    setPixel(i, j, color);
                }
            }
        } else {
            // Rysowanie pustego prostokąta
            drawLine(x, y, x + w - 1, y, color);
            drawLine(x, y + h - 1, x + w - 1, y + h - 1, color);
            drawLine(x, y, x, y + h - 1, color);
            drawLine(x + w - 1, y, x + w - 1, y + h - 1, color);
        }
    }

    function drawCircle(x0: number, y0: number, r: number, fill: boolean, color: number): void {
        let x = r;
        let y = 0;
        let err = 0;

        while (x >= y) {
            if (fill) {
                drawLine(x0 - x, y0 + y, x0 + x, y0 + y, color);
                drawLine(x0 - y, y0 + x, x0 + y, y0 + x, color);
                drawLine(x0 - x, y0 - y, x0 + x, y0 - y, color);
                drawLine(x0 - y, y0 - x, x0 + y, y0 - x, color);
            } else {
                setPixel(x0 + x, y0 + y, color);
                setPixel(x0 + y, y0 + x, color);
                setPixel(x0 - y, y0 + x, color);
                setPixel(x0 - x, y0 + y, color);
                setPixel(x0 - x, y0 - y, color);
                setPixel(x0 - y, y0 - x, color);
                setPixel(x0 + y, y0 - x, color);
                setPixel(x0 + x, y0 - y, color);
            }

            y++;
            if (err <= 0) {
                err += 2 * y + 1;
            } else {
                x--;
                err += 2 * (y - x) + 1;
            }
        }
    }

    // --- SEKCJA 3: SILNIK ROBOEYES ---

    /**
     * Rysuje pojedyncze oko w zadanym punkcie centralnym uwzględniając emocję.
     */
    function renderEye(cx: number, cy: number, w: number, h: number, mood: string): void {
        if (isBlinking) {
            // Zamknięte oko podczas mrugania - pozioma kreska
            drawRect(cx - w / 2, cy - 1, w, 3, true, 1);
            return;
        }

        // 1. Podstawowe rysowanie gałki ocznej (białko oka)
        drawCircle(cx, cy - h / 4, w / 2, true, 1);
        drawCircle(cx, cy + h / 4, w / 2, true, 1);
        drawRect(cx - w / 2, cy - h / 4, w, h / 2 + 1, true, 1);

        // 2. Rysowanie źrenicy (czarna plamka reagująca na kierunek spojrzenia)
        // Offset źrenicy wynosi 40% ogólnego przesunięcia spojrzenia
        let pupilX = cx + Math.round(gazeX * 0.4);
        let pupilY = cy + Math.round(gazeY * 0.4);
        drawCircle(pupilX, pupilY, 4, true, 0);

        // 3. Nakładanie masek emocjonalnych (wycinanie czarnym kolorem elementów oka)
        if (mood == "happy") {
            // Wesołe oczy: wycinamy dół oka, tworząc uśmiechnięty łuk (półksiężyc)
            drawRect(cx - w / 2 - 1, cy + 2, w + 2, h / 2 + 2, true, 0);
        } else if (mood == "angry") {
            // Złe oczy: ukośne brwi ścinające górne krawędzie do środka
            // Dla lewego oka i prawego oka kąt nachylenia brwi jest lustrzany
            if (cx < 64) {
                // Lewe oko
                for (let i = 0; i < h / 2; i++) {
                    drawLine(cx - w / 2 - 1, cy - h / 2 + i, cx + w / 2 + 1, cy - h / 2 + i - 3 + (cx - (cx - w / 2)), 0);
                }
            } else {
                // Prawe oko
                for (let i = 0; i < h / 2; i++) {
                    drawLine(cx - w / 2 - 1, cy - h / 2 + i - 3 + ((cx + w / 2) - cx), cx + w / 2 + 1, cy - h / 2 + i, 0);
                }
            }
            // Prostsza, niezawodna nakładka linii brwi
            drawLine(cx - w / 2 - 2, cy - h / 2, cx + w / 2 + 2, cy - h / 4, 0); 
        } else if (mood == "sad") {
            // Smutne oczy: skośne brwi opadające na zewnątrz
            if (cx < 64) {
                drawLine(cx - w / 2 - 2, cy - h / 4, cx + w / 2 + 2, cy - h / 2, 0);
            } else {
                drawLine(cx - w / 2 - 2, cy - h / 2, cx + w / 2 + 2, cy - h / 4, 0);
            }
        } else if (mood == "sleepy") {
            // Zaspane oczy: powieka zasłania górną połowę oka
            drawRect(cx - w / 2 - 1, cy - h / 2 - 1, w + 2, h / 2 + 2, true, 0);
        } else if (mood == "squint") {
            // Zmrużone oczy: powieki ścinają dół i górę
            drawRect(cx - w / 2 - 1, cy - h / 2 - 1, w + 2, h / 4 + 2, true, 0);
            drawRect(cx - w / 2 - 1, cy + h / 4 - 1, w + 2, h / 4 + 2, true, 0);
        }
    }

    // --- SEKCJA 4: PUBLICZNY INTERFEJS BLOCZKOWY ---

    /**
     * Inicjalizuje RoboEyes, uruchamia komunikację I2C z ekranem OLED SSD1306 i czyści wyświetlacz.
     */
    //% block="Uruchom RoboEyes"
    //% group="Konfiguracja"
    //% weight=100
    export function initialize(): void {
        initOLED();
        show();
    }

    /**
     * Rysuje dwoje oczu w buforze i natychmiast wysyła obraz na ekran OLED.
     */
    //% block="Wyświetl oczy || stan %mood"
    //% mood.defl="normal"
    //% group="Sterowanie Oczami"
    //% weight=95
    export function show(mood: string = "normal"): void {
        currentMood = mood;
        clear();
        
        let screenWidth = 128;
        let screenHeight = 64;

        // Wyznaczenie środków oczu uwzględniając odległości oraz ruch gałek (gazeX, gazeY)
        let leftCenterX = (screenWidth / 2) - (eyeSpacing / 2) + gazeX;
        let rightCenterX = (screenWidth / 2) + (eyeSpacing / 2) + gazeX;
        let centerY = (screenHeight / 2) + gazeY;

        // Ograniczenie pozycji rysowania oczu, aby nie wyszły poza krawędzie fizyczne OLED
        leftCenterX = Math.clamp(w / 2, 64 - 2, leftCenterX);
        rightCenterX = Math.clamp(64 + 2, screenWidth - w / 2, rightCenterX);
        centerY = Math.clamp(h / 2, screenHeight - h / 2, centerY);

        renderEye(leftCenterX, centerY, eyeWidth, eyeHeight, mood);
        renderEye(rightCenterX, centerY, eyeWidth, eyeHeight, mood);
        
        update();
    }

    /**
     * Zmienia kierunek spojrzenia oczu (rozglądanie się).
     * @param x przesunięcie poziome od -15 do 15
     * @param y przesunięcie pionowe od -10 do 10
     */
    //% block="Spójrz w kierunku X %x Y %y"
    //% x.min=-15 x.max=15 x.defl=0
    //% y.min=-10 y.max=10 y.defl=0
    //% group="Animacje i Pozycja"
    //% weight=90
    export function lookAt(x: number, y: number): void {
        gazeX = x;
        gazeY = y;
        show(currentMood);
    }

    /**
     * Wykonuje naturalną, płynną animację mrugnięcia oczami.
     */
    //% block="Mrugnij"
    //% group="Animacje i Pozycja"
    //% weight=85
    export function blink(): void {
        isBlinking = true;
        show(currentMood);
        basic.pause(140); // Standardowy fizjologiczny czas trwania mrugnięcia
        isBlinking = false;
        show(currentMood);
    }

    /**
     * Ustawia stan emocjonalny (emocję) robota.
     * Dostępne stany: "normal", "happy", "angry", "sad", "sleepy", "squint"
     */
    //% block="Ustaw emocję na %mood"
    //% group="Sterowanie Oczami"
    //% weight=80
    export function setMood(mood: string): void {
        currentMood = mood;
        show(mood);
    }

    /**
     * Włącza lub wyłącza automatyczne, losowe mruganie oczu w tle, aby robot wyglądał jak żywy.
     */
    //% block="Automatyczne mruganie %enable"
    //% enable.shadow="toggleOnOff"
    //% group="Animacje i Pozycja"
    //% weight=75
    export function autoBlink(enable: boolean): void {
        autoBlinkEnabled = enable;
        if (autoBlinkEnabled) {
            control.inBackground(function () {
                while (autoBlinkEnabled) {
                    // Losowy interwał między mrugnięciami (od 2.5 do 6 sekund)
                    let delay = randint(2500, 6000);
                    basic.pause(delay);
                    if (autoBlinkEnabled && !isBlinking) {
                        blink();
                    }
                }
            });
        }
    }
}
