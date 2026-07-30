'use strict';
/* ============================================================
   EMBEDDED DEFAULT DATA (architect input + architect contract)
   ============================================================ */
const PRELOADED = {"input": {"id": "A_1", "title": "Regulated Isolated Flyback HV Charger with Capacitive Actuator Output driven by HV optocouplers in Half-bridge configuration", "description": "This architecture uses the rechargeable battery and 5 V USB charging front end to feed a protected low-voltage power rail, then drives an isolated high-frequency flyback high-voltage converter and a Diode-Capacitor-based Voltage Multiplier whose rectified secondary creates a HV bus with a fixed 14 kV output.After the HV Bus, two HV optical diode or optocoupler are implemented in a Half-bridge configuration with the channel output connected into the middle of the half-bridge,  such that it can be connected to the HV bus or shorted in the charge and discharge process respectively.Non additional high-voltage output capacitor is required and the only additional energy of the secondary HV Bus is provided by Diode-Capacitor-based Voltage Multipliers. A high-impedance sensing divider or isolated voltage feedback path is used by the controller to keep the bus stable at 14 kV. Charge rate is controlled by the PWM of the Low Voltage optocoupler inputs between 100% and 0% duty cycle. Additional voltage measurement feedback is required to monitor the charge of each output channel. Primary-side current limiting and cycle-by-cycle energy control so the 5 nF load can be charged at 2 Hz to 8 Hz while limiting current during arcing or short-circuit conditions. Discharge is handled by a normally enabled fail-safe bleed path plus the Low Side optocoupler to actively commanded high-voltage discharge path sized to reduce 14 kV on 5 nF to below 60 V within 1 s. The same PCB includes battery charge management, battery protection, thermal sensing, USB reverse-polarity and surge/ESD protection, a low-power controller, sealed user controls, and state indication. EMC is addressed with input filtering at the charging interface, shielding/guarding around the high-voltage node, spread-spectrum or fixed ultrasonic switching above audible range, and reinforced/double insulation between the case-accessible circuits and high-voltage region. This is the simplest single-channel architecture and minimizes interconnect complexity, but the flyback transformer and output rectifier stack must be designed carefully for 14 kV insulation stress.", "key_references": ["https://www.artimusrobotics.com/post/power-consumption-of-hasel-actuators", "https://ieeexplore.ieee.org/iel7/8847244/9107390/10210012.pdf", "https://incompliancemag.com/the-capacitive-discharge-test", "https://advanced.onlinelibrary.wiley.com/doi/10.1002/admt.202101469"], "ic_components": [{"ic_type": "USB single-cell Li-ion linear charger and power-path manager", "description": "5 V USB input single-cell Li-ion/Li-poly charger with dynamic power-path management, input over-voltage protection, thermal regulation, charge termination, status outputs, and system rail support while charging.", "manufacturer": "Texas Instruments", "ic_part_number": "BQ24075", "DatasheetUrl": "https://www.ti.com/lit/ds/symlink/bq24075-q1.pdf", "selection_rationale": "Approved manufacturer with highest preference. Fits 5 V USB rechargeable battery front end, provides robust production-grade charge management and power-path behavior so the system can run while charging. Input operating range and safety features align with protected low-voltage portable product architecture."}, {"ic_type": "1-cell Li-ion battery protector", "description": "Secondary lithium-ion protector for cell over-voltage, under-voltage, and over-current/short-circuit protection with low quiescent current.", "manufacturer": "Texas Instruments", "ic_part_number": "BQ2970", "DatasheetUrl": "https://www.ti.com/lit/ds/symlink/bq2971.pdf", "selection_rationale": "Approved high-preference manufacturer. Adds dedicated pack-level protection independent of charger and MCU, improving robustness against abuse and fault conditions expected in a fielded product."}, {"ic_type": "Buck-boost DC/DC converter", "description": "High-efficiency buck-boost converter generating regulated system rail from single-cell battery across charge/discharge range with integrated switches and power-save operation.", "manufacturer": "Texas Instruments", "ic_part_number": "TPS63070", "DatasheetUrl": "https://www.ti.com/lit/ds/symlink/tps63070.pdf", "selection_rationale": "Approved highest-preference source. A buck-boost rail is appropriate because battery voltage can be above or below the required regulated logic rail during operation. Supports professional power integrity and good efficiency versus purely linear regulation."}, {"ic_type": "Low-noise LDO regulator", "description": "Ultra-low quiescent current LDO used to derive a clean analog rail for sensing, references, and precision measurements from the main system supply.", "manufacturer": "Texas Instruments", "ic_part_number": "TPS7A20", "DatasheetUrl": "https://www.ti.com/lit/ds/symlink/tps7a20.pdf", "selection_rationale": "Adds a dedicated clean rail for feedback and ADC reference-sensitive circuitry, improving HV voltage regulation accuracy and noise immunity in a switching, high-EMI environment."}, {"ic_type": "Boost converter controller", "description": "Compact boost converter to generate an auxiliary higher-than-battery rail where needed for controlled drive of discharge or protection circuitry on the low-voltage side.", "manufacturer": "Texas Instruments", "ic_part_number": "TPS61041", "DatasheetUrl": "https://www.ti.com/lit/ds/symlink/tps61040.pdf", "selection_rationale": "Provides implementation margin for controlled active discharge interface circuitry and any low-side auxiliary biasing without burdening the main rail. Chosen from approved preferred manufacturer."}, {"ic_type": "Current-mode PWM controller", "description": "Current-mode PWM controller with cycle-by-cycle current limiting, UVLO, and high-frequency operation suitable for isolated flyback energy control.", "manufacturer": "Texas Instruments", "ic_part_number": "UCC28C43", "DatasheetUrl": "https://www.ti.com/lit/ds/symlink/ucc38c40.pdf", "selection_rationale": "Approved highest-preference source. Current-mode control directly supports the stated need for primary-side current limiting and cycle-by-cycle energy control. Can be configured for ultrasonic switching frequency and robust fault limiting. A controller approach is more appropriate than an integrated low-voltage flyback switch because the transformer and primary power stage are specialized for HV charging."}, {"ic_type": "Single low-side gate driver", "description": "High-current low-side MOSFET gate driver for the external primary switch of the flyback stage, with fast rise/fall times and strong drive capability.", "manufacturer": "Texas Instruments", "ic_part_number": "UCC27517", "DatasheetUrl": "https://www.ti.com/lit/ds/symlink/ucc27517.pdf", "selection_rationale": "A dedicated driver improves switching control, EMI management, and efficiency for the primary HV charger stage versus driving the power switch directly from the PWM controller. Selected from highest-preference approved manufacturer."}, {"ic_type": "Reinforced isolated precision amplifier", "description": "Precision reinforced isolation amplifier for transferring scaled HV output feedback across the safety barrier to the low-voltage controller domain.", "manufacturer": "Texas Instruments", "ic_part_number": "AMC1311", "DatasheetUrl": "https://www.ti.com/lit/ds/symlink/amc1311.pdf", "selection_rationale": "The design explicitly allows an isolated voltage feedback path and requires reinforced/double insulation between user-accessible circuits and HV region. This device provides a production-grade isolated analog channel for regulation and monitoring while maintaining safety isolation. TI is highest preference and offers reinforced isolation suitable for professional implementation."}, {"ic_type": "Reinforced isolated amplifier", "description": "Reinforced isolated amplifier for accurate measurement of shunt-based primary current or fault-related analog signals while preserving barrier integrity.", "manufacturer": "Texas Instruments", "ic_part_number": "AMC3330", "DatasheetUrl": "https://www.ti.com/lit/ds/symlink/amc3330.pdf", "selection_rationale": "Adds independent monitored current information beyond cycle-by-cycle limiting, enabling diagnostics and more reliable arc/short-circuit response. Chosen from approved high-preference manufacturer and aligned with reinforced isolation philosophy."}, {"ic_type": "Dual operational amplifier", "description": "Dual op-amp for conditioning divider feedback, filtering, threshold generation, and analog interfacing for HV regulation and discharge confirmation.", "manufacturer": "Texas Instruments", "ic_part_number": "TLV9062", "DatasheetUrl": "https://www.ti.com/lit/ds/symlink/tlv9062.pdf", "selection_rationale": "Provides robust analog front-end capability for precision filtering and comparator threshold support around HV sensing. Selected from preferred approved source with modern low-power rail-to-rail performance."}, {"ic_type": "Comparator", "description": "Low-power comparator for hardware threshold supervision of scaled HV output or critical rails, enabling independent fault response outside firmware.", "manufacturer": "Texas Instruments", "ic_part_number": "TLV7011", "DatasheetUrl": "https://www.ti.com/lit/ds/symlink/tlv7011.pdf", "selection_rationale": "Professional design should not rely solely on firmware for HV safety-critical thresholds. This comparator supports independent hardware interlock behavior for over-voltage or safe-to-touch confirmation logic."}, {"ic_type": "Precision voltage reference", "description": "Low-drift precision voltage reference used for stable feedback scaling, ADC accuracy, and consistent HV setpoint control.", "manufacturer": "Texas Instruments", "ic_part_number": "REF3330", "DatasheetUrl": "https://www.ti.com/lit/ds/symlink/ref33.pdf", "selection_rationale": "Improves regulation stability and absolute accuracy toward the better-than-10% HV target, especially over temperature and battery variation. Selected from approved highest-preference source."}, {"ic_type": "32-bit microcontroller", "description": "Low-power microcontroller with ADC, timers, GPIO, communication interfaces, watchdog, and sufficient processing to manage charging profiles, voltage setpoints, user controls, state indication, and fault handling.", "manufacturer": "Texas Instruments", "ic_part_number": "MSPM0G3507", "DatasheetUrl": "https://www.ti.com/lit/ds/symlink/mspm0g3507.pdf", "selection_rationale": "Approved highest-preference manufacturer. A modern MCU is required for command selection, sequencing, diagnostics, event logging, and future expansion. Integrated ADC/timers simplify closed-loop supervision and 2 Hz to 8 Hz cycle management."}, {"ic_type": "Window watchdog timer", "description": "External watchdog timer to supervise MCU operation and force recovery on firmware lockup or timing faults.", "manufacturer": "Texas Instruments", "ic_part_number": "TPS3431", "DatasheetUrl": "https://www.ti.com/lit/ds/symlink/tps3431-q1.pdf", "selection_rationale": "For a high-voltage portable product, independent supervision is good engineering practice and improves safety and reliability beyond the internal MCU watchdog alone."}, {"ic_type": "Digital temperature sensor", "description": "High-accuracy digital temperature sensor for battery/board thermal monitoring and charger or HV converter derating logic.", "manufacturer": "Texas Instruments", "ic_part_number": "TMP117", "DatasheetUrl": "https://www.ti.com/lit/ds/symlink/tmp117.pdf", "selection_rationale": "The design explicitly requires thermal sensing. A precision digital sensor simplifies calibration and supports protective derating and fault shutdown in a compact system."}, {"ic_type": "ESD protection array", "description": "Low-capacitance multi-channel ESD protection array for USB power and low-speed control lines exposed at the product interface.", "manufacturer": "Texas Instruments", "ic_part_number": "TPD4E05U06", "DatasheetUrl": "https://www.ti.com/lit/ds/symlink/tpd4e05u06.pdf", "selection_rationale": "The design explicitly calls for USB surge/ESD protection. This is a standard production-grade interface protection IC from the highest-preference approved vendor."}, {"ic_type": "eFuse / power protection IC", "description": "Integrated eFuse with over-voltage protection, current limiting, inrush control, reverse current blocking, and fault reporting for the 5 V input path.", "manufacturer": "Texas Instruments", "ic_part_number": "TPS25940", "DatasheetUrl": "https://www.ti.com/lit/ds/symlink/tps25940.pdf", "selection_rationale": "Provides a much more robust USB/front-end protection strategy than simple passive protection alone, addressing reverse-current/inrush/fault events and improving survivability in real use."}, {"ic_type": "Reinforced digital isolator", "description": "Reinforced digital isolator for transferring control/status signals across the isolation barrier where direct MCU-domain connection to HV-side sensing or control logic is undesirable.", "manufacturer": "Texas Instruments", "ic_part_number": "ISO6741", "DatasheetUrl": "https://www.ti.com/lit/ds/symlink/iso6740.pdf", "selection_rationale": "Supports a professional partitioned architecture with reinforced digital barrier communications, aiding diagnostics and safe signal transfer between accessible circuitry and HV domain."}, {"ic_type": "Dual Schmitt-trigger buffer", "description": "Dual Schmitt-trigger buffer for sealed switch debounce, noisy external signal cleanup, and robust logic edge conditioning.", "manufacturer": "Texas Instruments", "ic_part_number": "SN74LVC2G17", "DatasheetUrl": "https://www.ti.com/lit/ds/symlink/sn74lvc2g17.pdf", "selection_rationale": "Improves immunity to EMI and false triggering in a high-voltage switching environment, which is important for sealed user controls and reliable field operation."}, {"ic_type": "LED driver", "description": "Programmable LED driver for multi-state visual indication independent of MCU GPIO drive limitations.", "manufacturer": "Texas Instruments", "ic_part_number": "LP5562", "DatasheetUrl": "https://www.ti.com/lit/ds/symlink/lp5562.pdf", "selection_rationale": "Supports professional status indication with consistent brightness and reduced MCU loading, useful for charge/discharge/fault/status outputs in a production device."}, {"ic_type": "24-bit delta-sigma ADC", "description": "Precision ADC for high-resolution measurement of scaled HV feedback, current sense, and temperature-related analog channels where MCU ADC performance is insufficient.", "manufacturer": "Texas Instruments", "ic_part_number": "ADS1220", "DatasheetUrl": "https://www.ti.com/lit/ds/symlink/ads1220.pdf", "selection_rationale": "A dedicated precision ADC improves closed-loop accuracy margin, production calibration capability, and diagnostics for the HV charger beyond a minimal implementation. Particularly useful when using very high-impedance dividers and filtered sensing."}]}, "contract": {"global_nets": [{"name": "USB_5V_IN", "type": "POWER_DISTRIBUTION", "source": "external block: USB connector", "consumers": ["TPD4E05U06", "TPS25940"], "description": "Incoming 5 V from USB charging interface before protection and power-path control."}, {"name": "USB_GND", "type": "GROUND", "source": "external block: USB connector", "consumers": ["TPD4E05U06", "BQ24075", "TPS25940", "external block: user-accessible low-voltage domain"], "description": "Ground return for USB power and all non-isolated low-voltage circuitry."}, {"name": "USB_D_P", "type": "DIGITAL_LOGIC", "source": "external block: USB connector", "consumers": ["TPD4E05U06"], "description": "Protected USB D+ line present at external interface for ESD handling."}, {"name": "USB_D_N", "type": "DIGITAL_LOGIC", "source": "external block: USB connector", "consumers": ["TPD4E05U06"], "description": "Protected USB D- line present at external interface for ESD handling."}, {"name": "VIN_PROTECTED_5V", "type": "POWER_DISTRIBUTION", "source": "TPS25940", "consumers": ["BQ24075"], "description": "Protected 5 V input rail after eFuse used to power the battery charger/power-path IC."}, {"name": "EFUSE_FLT", "type": "DIGITAL_LOGIC", "source": "TPS25940", "consumers": ["MSPM0G3507"], "description": "Fault status indication from USB input eFuse to the MCU."}, {"name": "EFUSE_EN", "type": "CONTROL_SIGNAL", "source": "MSPM0G3507", "consumers": ["TPS25940"], "description": "MCU-controlled enable for the USB input eFuse/protection stage."}, {"name": "BAT_CELL_P", "type": "POWER_DISTRIBUTION", "source": "external block: single-cell Li-ion battery", "consumers": ["BQ2970"], "description": "Positive terminal of the rechargeable Li-ion cell into the protection IC."}, {"name": "BAT_CELL_N", "type": "GROUND", "source": "external block: single-cell Li-ion battery", "consumers": ["BQ2970"], "description": "Negative terminal of the rechargeable Li-ion cell into the protection IC."}, {"name": "PACK_BAT_P", "type": "POWER_DISTRIBUTION", "source": "BQ2970", "consumers": ["BQ24075", "TPS63070"], "description": "Protected battery pack positive rail feeding charger battery pin and system buck-boost input."}, {"name": "PACK_BAT_N", "type": "GROUND", "source": "BQ2970", "consumers": ["BQ24075", "TPS63070", "external block: user-accessible low-voltage domain"], "description": "Protected battery return tied to the low-voltage ground domain."}, {"name": "SYS_PWR", "type": "POWER_DISTRIBUTION", "source": "BQ24075", "consumers": ["TPS63070"], "description": "Charger/power-path managed system supply available while USB is present and battery is charging."}, {"name": "CHG_STATUS", "type": "DIGITAL_LOGIC", "source": "BQ24075", "consumers": ["MSPM0G3507"], "description": "Charge status output from the charger to the MCU."}, {"name": "PGOOD_CHARGER", "type": "DIGITAL_LOGIC", "source": "BQ24075", "consumers": ["MSPM0G3507"], "description": "Power-good or input-valid status from the charger front end to the MCU."}, {"name": "CHARGER_EN", "type": "CONTROL_SIGNAL", "source": "MSPM0G3507", "consumers": ["BQ24075"], "description": "MCU control to enable or disable battery charging."}, {"name": "CHARGER_USB_LIMIT_SEL", "type": "CONTROL_SIGNAL", "source": "MSPM0G3507", "consumers": ["BQ24075"], "description": "MCU-selected charger/input current operating mode or limit selection."}, {"name": "VSYS_3V3", "type": "POWER_DISTRIBUTION", "source": "TPS63070", "consumers": ["TPS7A20", "TPS61041", "MSPM0G3507", "TPS3431", "TMP117", "ISO6741", "SN74LVC2G17", "LP5562", "ADS1220", "UCC28C43", "UCC27517"], "description": "Main regulated low-voltage system rail distributed to digital, control, and primary-side analog ICs."}, {"name": "3V3_ANA", "type": "POWER_DISTRIBUTION", "source": "TPS7A20", "consumers": ["REF3330", "TLV9062", "TLV7011", "AMC3330", "ADS1220"], "description": "Low-noise analog rail for precision references, sensing, and measurement circuitry in the low-voltage domain."}, {"name": "GND_LV", "type": "GROUND", "source": "external block: user-accessible low-voltage domain", "consumers": ["BQ24075", "BQ2970", "TPS63070", "TPS7A20", "TPS61041", "UCC28C43", "UCC27517", "AMC3330", "TLV9062", "TLV7011", "REF3330", "MSPM0G3507", "TPS3431", "TMP117", "TPD4E05U06", "TPS25940", "ISO6741", "SN74LVC2G17", "LP5562", "ADS1220"], "description": "Primary low-voltage ground domain for user-accessible, battery, logic, and primary flyback control circuitry."}, {"name": "AUX_BOOST_V", "type": "POWER_DISTRIBUTION", "source": "TPS61041", "consumers": ["external block: low-voltage optocoupler LED drive circuitry", "external block: active discharge interface circuitry"], "description": "Auxiliary boosted rail used for low-voltage-side actuator or discharge drive headroom."}, {"name": "REF_3V0", "type": "QUIET_REFERENCE", "source": "REF3330", "consumers": ["ADS1220", "TLV9062", "TLV7011", "MSPM0G3507"], "description": "Precision 3.0 V reference distributed for ADC scaling, analog thresholds, and calibration-aware measurement."}, {"name": "I2C_SCL", "type": "DIGITAL_LOGIC", "source": "MSPM0G3507", "consumers": ["TMP117", "LP5562"], "description": "I2C clock from the MCU to low-speed digital peripherals."}, {"name": "I2C_SDA", "type": "DIGITAL_LOGIC", "source": "MSPM0G3507", "consumers": ["TMP117", "LP5562"], "description": "I2C bidirectional data line between the MCU and digital peripherals."}, {"name": "SPI_SCLK", "type": "DIGITAL_LOGIC", "source": "MSPM0G3507", "consumers": ["ADS1220"], "description": "SPI serial clock from MCU to the precision ADC."}, {"name": "SPI_MOSI", "type": "DIGITAL_LOGIC", "source": "MSPM0G3507", "consumers": ["ADS1220"], "description": "SPI controller-to-ADC data line."}, {"name": "SPI_MISO", "type": "DIGITAL_LOGIC", "source": "ADS1220", "consumers": ["MSPM0G3507"], "description": "SPI ADC-to-controller data line."}, {"name": "ADC_CS_N", "type": "CONTROL_SIGNAL", "source": "MSPM0G3507", "consumers": ["ADS1220"], "description": "Active-low chip select for the precision ADC."}, {"name": "ADC_DRDY_N", "type": "DIGITAL_LOGIC", "source": "ADS1220", "consumers": ["MSPM0G3507"], "description": "Data-ready or conversion-status interrupt from the precision ADC to the MCU."}, {"name": "TMP117_ALERT_N", "type": "DIGITAL_LOGIC", "source": "TMP117", "consumers": ["MSPM0G3507"], "description": "Temperature alert/interrupt output from the digital temperature sensor."}, {"name": "WDI", "type": "CONTROL_SIGNAL", "source": "MSPM0G3507", "consumers": ["TPS3431"], "description": "Watchdog service pulse from the MCU to the external watchdog timer."}, {"name": "WATCHDOG_RST_N", "type": "CONTROL_SIGNAL", "source": "TPS3431", "consumers": ["MSPM0G3507"], "description": "Independent watchdog reset output applied to the MCU."}, {"name": "MCU_RESET_IN_N", "type": "CONTROL_SIGNAL", "source": "external block: reset/programming header", "consumers": ["MSPM0G3507"], "description": "External reset/programming access into the MCU."}, {"name": "SWITCH_RAW_1", "type": "DIGITAL_LOGIC", "source": "external block: sealed user control 1", "consumers": ["SN74LVC2G17"], "description": "Raw user switch input before Schmitt cleanup."}, {"name": "SWITCH_RAW_2", "type": "DIGITAL_LOGIC", "source": "external block: sealed user control 2", "consumers": ["SN74LVC2G17"], "description": "Second raw user switch input before Schmitt cleanup."}, {"name": "SWITCH_CLEAN_1", "type": "DIGITAL_LOGIC", "source": "SN74LVC2G17", "consumers": ["MSPM0G3507"], "description": "Debounced and EMI-hardened user control signal to the MCU."}, {"name": "SWITCH_CLEAN_2", "type": "DIGITAL_LOGIC", "source": "SN74LVC2G17", "consumers": ["MSPM0G3507"], "description": "Second debounced and EMI-hardened user control signal to the MCU."}, {"name": "LED_EN", "type": "CONTROL_SIGNAL", "source": "MSPM0G3507", "consumers": ["LP5562"], "description": "MCU enable control for the LED driver."}, {"name": "LED_ENGINE_SYNC", "type": "CONTROL_SIGNAL", "source": "MSPM0G3507", "consumers": ["LP5562"], "description": "Optional synchronization or trigger control from MCU to programmable LED driver."}, {"name": "LED_CH1", "type": "POWER_DISTRIBUTION", "source": "LP5562", "consumers": ["external block: status LED 1"], "description": "Programmable current-drive output for status LED channel 1."}, {"name": "LED_CH2", "type": "POWER_DISTRIBUTION", "source": "LP5562", "consumers": ["external block: status LED 2"], "description": "Programmable current-drive output for status LED channel 2."}, {"name": "LED_CH3", "type": "POWER_DISTRIBUTION", "source": "LP5562", "consumers": ["external block: status LED 3"], "description": "Programmable current-drive output for status LED channel 3."}, {"name": "PWM_CTRL", "type": "CONTROL_SIGNAL", "source": "MSPM0G3507", "consumers": ["UCC28C43"], "description": "MCU supervisory PWM or run-level control input to the flyback PWM controller for charge-rate management."}, {"name": "HV_CHARGER_ENABLE", "type": "CONTROL_SIGNAL", "source": "MSPM0G3507", "consumers": ["UCC28C43"], "description": "MCU enable/disable command for the primary flyback high-voltage charging controller."}, {"name": "PRIMARY_GATE_DRIVE", "type": "CONTROL_SIGNAL", "source": "UCC28C43", "consumers": ["UCC27517"], "description": "PWM drive signal from the current-mode controller to the external MOSFET gate driver."}, {"name": "PRIMARY_MOSFET_GATE", "type": "CONTROL_SIGNAL", "source": "UCC27517", "consumers": ["external block: flyback primary power MOSFET"], "description": "High-current gate-drive output to the primary flyback switching MOSFET."}, {"name": "PRIMARY_SWITCH_NODE", "type": "SWITCHING_NODE", "source": "external block: flyback primary power MOSFET", "consumers": ["external block: flyback transformer primary"], "description": "High-dv/dt primary switching node between MOSFET and flyback transformer primary."}, {"name": "PRIMARY_CURRENT_SENSE", "type": "SENSING_LINE", "source": "external block: primary current shunt", "consumers": ["UCC28C43", "AMC3330"], "description": "Primary current sense signal used for cycle-by-cycle limiting and isolated measurement."}, {"name": "PRIMARY_CURRENT_FB", "type": "ANALOG_SIGNAL", "source": "AMC3330", "consumers": ["ADS1220", "MSPM0G3507", "TLV9062"], "description": "Conditioned low-voltage-domain representation of primary current for monitoring, logging, and fault control."}, {"name": "HV_GND_ISO", "type": "GROUND", "source": "external block: isolated high-voltage control domain", "consumers": ["AMC1311", "ISO6741", "external block: HV divider/sense network", "external block: HV-side optocoupler drivers"], "description": "Isolated secondary-side ground/reference domain associated with the high-voltage sensing and control partition."}, {"name": "HV_AUX_ISO", "type": "POWER_DISTRIBUTION", "source": "external block: isolated secondary bias supply", "consumers": ["AMC1311", "ISO6741", "external block: HV-side optocoupler drivers"], "description": "Isolated low-power supply rail for secondary-side sensing and digital isolator circuitry."}, {"name": "HV_BUS_SENSE_RAW", "type": "HIGH_VOLTAGE_PATH", "source": "external block: HV bus divider network", "consumers": ["AMC1311", "TLV7011", "TLV9062"], "description": "Scaled but still HV-domain-referenced bus voltage sense from the 14 kV bus divider."}, {"name": "HV_BUS_FB_ISO", "type": "FEEDBACK_PATH", "source": "AMC1311", "consumers": ["ADS1220", "MSPM0G3507", "TLV9062", "UCC28C43"], "description": "Isolated analog representation of the high-voltage bus used for regulation, telemetry, and fault handling."}, {"name": "HV_OVERVOLTAGE_HW", "type": "DIGITAL_LOGIC", "source": "TLV7011", "consumers": ["MSPM0G3507", "UCC28C43"], "description": "Independent hardware threshold indication for HV overvoltage or safe-state supervision."}, {"name": "HV_MONITOR_COND", "type": "ANALOG_SIGNAL", "source": "TLV9062", "consumers": ["ADS1220", "MSPM0G3507"], "description": "Filtered and conditioned analog monitor channel derived from HV feedback for precision measurement."}, {"name": "PRIMARY_CURRENT_COND", "type": "ANALOG_SIGNAL", "source": "TLV9062", "consumers": ["ADS1220", "MSPM0G3507"], "description": "Filtered and conditioned analog monitor channel for primary current diagnostics."}, {"name": "HV_STATUS_ISO", "type": "DIGITAL_LOGIC", "source": "ISO6741", "consumers": ["MSPM0G3507"], "description": "Isolated status return from the HV-side control/sense domain to the MCU."}, {"name": "HV_DISCHARGE_DONE_ISO", "type": "DIGITAL_LOGIC", "source": "ISO6741", "consumers": ["MSPM0G3507"], "description": "Isolated indication that the HV output has been discharged below a safe threshold."}, {"name": "HV_PWM_CMD_ISO", "type": "DIGITAL_LOGIC", "source": "MSPM0G3507", "consumers": ["ISO6741"], "description": "Digital control stream from MCU intended to cross the reinforced barrier for HV-side control functions."}, {"name": "HV_DISCHARGE_CMD_ISO", "type": "DIGITAL_LOGIC", "source": "MSPM0G3507", "consumers": ["ISO6741"], "description": "Isolated discharge command from MCU to the HV-side control domain."}, {"name": "HV_CHARGE_OPTO_LED_DRIVE", "type": "CONTROL_SIGNAL", "source": "external block: HV-side optocoupler driver circuitry", "consumers": ["external block: HV charge optocoupler input LED"], "description": "Drive path for the charge-side optocoupler input controlling connection of output node to the HV bus."}, {"name": "HV_DISCHARGE_OPTO_LED_DRIVE", "type": "CONTROL_SIGNAL", "source": "external block: HV-side optocoupler driver circuitry", "consumers": ["external block: HV discharge optocoupler input LED"], "description": "Drive path for the discharge-side optocoupler input controlling active short-to-return discharge."}, {"name": "HV_TRANSFORMER_SEC_AC", "type": "HIGH_VOLTAGE_PATH", "source": "external block: flyback transformer secondary", "consumers": ["external block: diode-capacitor voltage multiplier"], "description": "High-frequency secondary AC from flyback transformer into the HV multiplier stack."}, {"name": "HV_BUS_14KV", "type": "HIGH_VOLTAGE_PATH", "source": "external block: diode-capacitor voltage multiplier", "consumers": ["external block: HV charge optocoupler half-bridge", "external block: HV bleed path", "external block: HV divider/sense network"], "description": "Main rectified high-voltage bus at approximately 14 kV."}, {"name": "HV_RETURN", "type": "HIGH_VOLTAGE_PATH", "source": "external block: diode-capacitor voltage multiplier", "consumers": ["external block: HV discharge optocoupler half-bridge", "external block: HV bleed path", "external block: HV output connector", "external block: HV divider/sense network"], "description": "High-voltage return/reference node for the output stack and discharge path."}, {"name": "HV_OUTPUT_NODE", "type": "HIGH_VOLTAGE_PATH", "source": "external block: HV half-bridge channel midpoint", "consumers": ["external block: HV output connector", "external block: output-channel divider/sense network", "external block: load 5 nF"], "description": "Single-channel high-voltage output node switched between the HV bus and discharge return."}, {"name": "HV_OUTPUT_SENSE_RAW", "type": "HIGH_VOLTAGE_PATH", "source": "external block: output-channel divider/sense network", "consumers": ["TLV9062", "TLV7011"], "description": "Scaled HV-domain-referenced sense of the output channel voltage for charge confirmation and discharge verification."}, {"name": "HV_OUTPUT_MONITOR_COND", "type": "ANALOG_SIGNAL", "source": "TLV9062", "consumers": ["ADS1220", "MSPM0G3507"], "description": "Conditioned analog measurement of the output-channel voltage used for monitoring and control."}, {"name": "SAFE_TO_TOUCH_HW", "type": "DIGITAL_LOGIC", "source": "TLV7011", "consumers": ["MSPM0G3507", "ISO6741"], "description": "Independent hardware indication that the output voltage is below the safe threshold."}, {"name": "BATTERY_TEMP_SENSE", "type": "SENSING_LINE", "source": "external block: battery/board thermal sensor location", "consumers": ["TMP117"], "description": "Thermal sensing connection representing battery or board temperature measurement location."}, {"name": "SWDIO", "type": "DIGITAL_LOGIC", "source": "external block: programming/debug header", "consumers": ["MSPM0G3507"], "description": "Programming/debug data interface to the MCU."}, {"name": "SWCLK", "type": "DIGITAL_LOGIC", "source": "external block: programming/debug header", "consumers": ["MSPM0G3507"], "description": "Programming/debug clock interface to the MCU."}], "external_blocks": [{"name": "USB connector", "description": "User-accessible USB interface providing 5 V input and exposed data pins requiring ESD protection."}, {"name": "single-cell Li-ion battery", "description": "Rechargeable 1-cell lithium-ion energy storage element for portable operation."}, {"name": "user-accessible low-voltage domain", "description": "Common non-isolated chassis-accessible low-voltage circuitry and reference domain."}, {"name": "reset/programming header", "description": "External low-voltage service interface for reset and firmware access."}, {"name": "programming/debug header", "description": "SWD or equivalent debug/programming connector for MCU development and production test."}, {"name": "sealed user control 1", "description": "Primary sealed pushbutton or switch input for user command entry."}, {"name": "sealed user control 2", "description": "Secondary sealed pushbutton or switch input for user command entry."}, {"name": "status LED 1", "description": "External visual indicator driven by the LED driver."}, {"name": "status LED 2", "description": "External visual indicator driven by the LED driver."}, {"name": "status LED 3", "description": "External visual indicator driven by the LED driver."}, {"name": "flyback primary power MOSFET", "description": "External primary-side switching transistor driven by the gate driver for the HV flyback stage."}, {"name": "flyback transformer primary", "description": "Primary winding of the isolated flyback transformer."}, {"name": "flyback transformer secondary", "description": "Secondary winding of the isolated flyback transformer feeding the HV multiplier."}, {"name": "diode-capacitor voltage multiplier", "description": "High-voltage multiplier stack producing the approximately 14 kV bus from the flyback secondary."}, {"name": "primary current shunt", "description": "Primary-side current sense element for cycle-by-cycle control and monitoring."}, {"name": "isolated secondary bias supply", "description": "Auxiliary isolated low-power supply serving the HV-side sensing and digital isolation domain."}, {"name": "isolated high-voltage control domain", "description": "Secondary-side low-power control/reference domain separated by reinforced insulation from the user-accessible circuitry."}, {"name": "HV divider/sense network", "description": "High-impedance divider network scaling the 14 kV bus for isolated feedback and hardware supervision."}, {"name": "output-channel divider/sense network", "description": "High-impedance divider network scaling the channel output voltage for monitoring and discharge confirmation."}, {"name": "HV charge optocoupler half-bridge", "description": "High-voltage optical switching element connecting the output node to the HV bus during charging."}, {"name": "HV discharge optocoupler half-bridge", "description": "High-voltage optical switching element connecting the output node to the HV return during active discharge."}, {"name": "HV charge optocoupler input LED", "description": "Low-voltage/isolated-side LED input controlling the HV charge optical switch."}, {"name": "HV discharge optocoupler input LED", "description": "Low-voltage/isolated-side LED input controlling the HV discharge optical switch."}, {"name": "HV-side optocoupler drivers", "description": "Isolated-side drive circuitry that energizes the optical switch input LEDs according to commanded charge/discharge control."}, {"name": "HV bleed path", "description": "Normally enabled fail-safe high-voltage bleed/discharge network from output and/or bus toward return."}, {"name": "HV half-bridge channel midpoint", "description": "Node between the charge and discharge HV optical switches forming the single-channel output."}, {"name": "HV output connector", "description": "External high-voltage output interface carrying the channel output and HV return."}, {"name": "load 5 nF", "description": "Representative capacitive load connected to the high-voltage output channel."}, {"name": "low-voltage optocoupler LED drive circuitry", "description": "Auxiliary low-voltage circuitry using boosted bias where needed to modulate optical control inputs."}, {"name": "active discharge interface circuitry", "description": "Support circuitry on the low-voltage side for commanded active discharge control implementation."}, {"name": "battery/board thermal sensor location", "description": "Physical thermal measurement point monitored by the temperature sensor for derating and protection."}]}};

/* ============================================================
   STATE
   ============================================================ */
const S = {
  meta: { id:null, title:'', description:'', key_references:[] },
  nodes: [],   // {id, kind:'ic'|'external', label, x, y, w, h, data}
  edges: [],   // {id, source, target, nets:[{name,type,description}], route?:{x,y}} — route is a manual elbow override
  groups: [],  // {id, title, description, members:[nodeId,...]} — explicit groups only, UNGROUPED is implicit
  groupPos: {}, // {[groupId]: {x,y}} — top-level sheet-symbol layout, keyed so it also covers the implicit UNGROUPED bucket
  groupEdgeRoutes: {}, // {[srcId+'→'+tgtId]: {x,y}} — manual routing for derived (non-persisted) group edges
  openGroup: null, // null = top-level view; groupId = drilled into that group (phase c)
  view: { tx:60, ty:40, k:1 },
  sel: null,   // {type:'node'|'edge'|'group'|'groupEdge'|'portal', id}
  link: null,  // {fromId, x, y} while dragging a connection
  edgeSeq: 0
};

const NODE_W_IC = 176, NODE_H_IC = 64, NODE_W_EXT = 160, NODE_H_EXT = 46;
// Sheet-symbol group blocks grow in Y to list every member's name — width stays fixed.
const GROUP_W = 240, GROUP_HEAD_H = 70, GROUP_MEMBER_ROW_H = 14, GROUP_FOOT_PAD = 14;
function groupBlockHeight(g){ return GROUP_HEAD_H + (g ? g.members.length : 0)*GROUP_MEMBER_ROW_H + GROUP_FOOT_PAD; }
const UNGROUPED_ID = 'UNGROUPED';
function isTopLevel(){ return S.openGroup == null; }
const $ = id => document.getElementById(id);
const svg = $('board'), viewport = $('viewport'),
      edgesG = $('edgesG'), nodesG = $('nodesG'), linkG = $('linkPreviewG');

/* ============================================================
   TOLERANT JSON PARSING (fences, {output}, arrays)
   ============================================================ */
function tolerantParse(text){
  if (typeof text !== 'string') return text;
  let t = text.trim().replace(/^\uFEFF/, '').replace(/^```json\s*/i,'').replace(/```\s*$/,'').trim();
  let d = JSON.parse(t);
  if (Array.isArray(d)) d = d[0];
  if (d && typeof d.output === 'string') return tolerantParse(d.output);
  if (d && d.output && typeof d.output === 'object') return d.output;
  if (d && typeof d === 'object'){
    const keys = Object.keys(d);
    if (keys.length === 1 && d[keys[0]] && typeof d[keys[0]] === 'object') return d[keys[0]];
  }
  return d;
}

/* ============================================================
   GRAPH BUILD (deterministic) : input + contract -> nodes/edges
   ============================================================ */
function buildGraph(input, contract, rawGroups){
  const nodes = [], edges = [];
  const byId = new Map();

  for (const ic of (input.ic_components||[])){
    const n = { id: ic.ic_part_number, kind:'ic', label: ic.ic_part_number,
      x:0, y:0, w:NODE_W_IC, h:NODE_H_IC, data: { ...ic } };
    nodes.push(n); byId.set(n.id, n);
  }
  const extByName = new Map();
  function extNode(name, description){
    const key = name.trim();
    if (extByName.has(key)) return extByName.get(key);
    const n = { id:'EXT:'+key, kind:'external', label:key, x:0, y:0,
      w:NODE_W_EXT, h:NODE_H_EXT, data:{ description: description||'' } };
    nodes.push(n); byId.set(n.id, n); extByName.set(key, n);
    return n;
  }
  for (const eb of (contract.external_blocks||[])) extNode(eb.name, eb.description);

  function resolveRef(ref){
    if (byId.has(ref)) return byId.get(ref);
    const core = String(ref).replace(/^external block:\s*/i,'').trim();
    if (extByName.has(core)) return extByName.get(core);
    // case-insensitive external match
    for (const [k,v] of extByName) if (k.toLowerCase()===core.toLowerCase()) return v;
    // unknown reference: auto-create as external (lossless, deterministic)
    return extNode(core, '(auto-created from contract reference)');
  }

  const edgeMap = new Map();
  for (const net of (contract.global_nets||[])){
    // GND is never drawn: every block shares a return path to some ground, so
    // routing it block-to-block adds a wire that carries no design information
    // and only clutters the diagram. Skipping it here (instead of after the
    // fact) means an edge that ONLY existed because of a shared ground net is
    // never created at all.
    if (/^GROUND$/i.test(net.type||'')) continue;
    const src = resolveRef(net.source);
    for (const cons of (net.consumers||[])){
      const dst = resolveRef(cons);
      if (!src || !dst || src.id===dst.id) continue;
      const key = src.id+'\u2192'+dst.id;
      if (!edgeMap.has(key)) edgeMap.set(key, { source:src.id, target:dst.id, nets:[] });
      const nets = edgeMap.get(key).nets;
      // A bus never carries the same net twice (a malformed contract can list the
      // same consumer more than once for one net — keep the first occurrence).
      if (!nets.some(x=>x.name===net.name))
        nets.push({ name:net.name, type:net.type||'NA', description:net.description||'' });
    }
  }
  // Group members arrive as IC part numbers or "external block: <Name>" refs — resolveRef
  // maps the latter to the "EXT:<Name>" node id (and auto-creates it if not already known,
  // same as it does for net endpoints, so the import stays lossless).
  const groups = [];
  (rawGroups||[]).forEach((g,i)=>{
    const members = [];
    for (const ref of (g.members||[])){
      const n = resolveRef(ref);
      if (n && !members.includes(n.id)) members.push(n.id);
    }
    members.sort();
    groups.push({ id:String(g.id||g.title||('GROUP_'+(i+1))), title:g.title||g.id||'Group',
      description:g.description||'', members });
  });
  groups.sort((a,b)=>a.id.localeCompare(b.id));

  nodes.sort((a,b)=>a.id.localeCompare(b.id));
  const edgeList = [...edgeMap.values()]
    .sort((a,b)=>(a.source+'|'+a.target).localeCompare(b.source+'|'+b.target));
  edgeList.forEach(e=>{ e.nets.sort((a,b)=>a.name.localeCompare(b.name)); e.id='e'+(S.edgeSeq++); edges.push(e); });

  return { nodes, edges, groups };
}

/* ============================================================
   GROUPS (explicit groups + implicit UNGROUPED bucket)
   ============================================================ */
function groupsWithUngrouped(){
  const covered = new Set(S.groups.flatMap(g=>g.members));
  const ungroupedIds = S.nodes.map(n=>n.id).filter(id=>!covered.has(id)).sort();
  const existing = S.groups.find(g=>g.id===UNGROUPED_ID);
  if (existing){
    return S.groups.map(g=>g===existing
      ? { ...g, members:[...new Set([...g.members, ...ungroupedIds])].sort() }
      : g);
  }
  return [...S.groups, { id:UNGROUPED_ID, title:'Ungrouped',
    description:'Blocks not assigned to a functional group.', members:ungroupedIds }];
}

function nodeGroupIndex(){
  const idx = new Map();
  for (const g of groupsWithUngrouped()) for (const m of g.members) idx.set(m, g.id);
  return idx;
}

// Derived (not persisted) group-to-group edges: aggregate every node-level edge
// whose endpoints fall in different groups. Read-only at the top level.
function computeGroupEdges(){
  const idx = nodeGroupIndex();
  const map = new Map();
  for (const e of S.edges){
    const gs = idx.get(e.source), gt = idx.get(e.target);
    if (!gs || !gt || gs===gt) continue;
    const key = gs+'→'+gt;
    if (!map.has(key)) map.set(key, { source:gs, target:gt, nets:[] });
    map.get(key).nets.push(...e.nets);
  }
  const list = [...map.values()].sort((a,b)=>(a.source+'|'+a.target).localeCompare(b.source+'|'+b.target));
  list.forEach((g,i)=>{
    g.nets.sort((a,b)=>a.name.localeCompare(b.name));
    // A bus never lists the same net twice: the same net often links several node
    // pairs between two groups (e.g. one rail feeding many members), which would
    // otherwise show up repeatedly in the inspector and inflate the count badge.
    const seen = new Set();
    g.nets = g.nets.filter(n=> seen.has(n.name) ? false : (seen.add(n.name), true));
    g.id='ge'+i;
  });
  return list;
}

function visibleGroups(){
  return groupsWithUngrouped().filter(g=>g.members.length);
}

// Moving to UNGROUPED_ID just removes the node from every explicit group's
// members — it doesn't need (or get) an S.groups entry of its own.
function moveMemberToGroup(nodeId, fromGroupId, toGroupId){
  if (fromGroupId === toGroupId) return;
  S.groups.forEach(g=>{ g.members = g.members.filter(m=>m!==nodeId); });
  if (toGroupId !== UNGROUPED_ID){
    const g = S.groups.find(x=>x.id===toGroupId);
    if (g){ g.members.push(nodeId); g.members.sort(); }
  }
}

function groupPosOf(id){
  if (!S.groupPos[id]) S.groupPos[id] = { x:40, y:420 };
  return S.groupPos[id];
}

function groupBlockRect(id){
  const p = groupPosOf(id);
  const g = groupsWithUngrouped().find(x=>x.id===id);
  return { id, x:p.x, y:p.y, w:GROUP_W, h:groupBlockHeight(g) };
}

// Group-level edges are recomputed from scratch every render (computeGroupEdges),
// so their manual routing can't live on the edge object itself — it's keyed by
// the stable source/target group ids instead, same idea as S.groupPos.
function groupEdgeRouteKey(src,tgt){ return src+'→'+tgt; }
function groupEdgeRouteOf(src,tgt){ return S.groupEdgeRoutes[groupEdgeRouteKey(src,tgt)]; }
function setGroupEdgeRoute(src,tgt,route){
  S.groupEdgeRoutes[groupEdgeRouteKey(src,tgt)] = { ...groupEdgeRouteOf(src,tgt), ...route };
}

/* ============================================================
   DETERMINISTIC AUTO-LAYOUT — full Sugiyama pipeline:
   1) layer assignment (longest-path, signal edges only)
   2) crossing reduction (barycenter, 8 alternating passes, all edges)
   3) y-coordinate assignment (neighbor-average relaxation, 4 passes, all edges)
   Every step uses a fixed iteration count and alphabetical tie-breaks, so the
   whole pipeline is deterministic: same graph in, same layout out, always.
   ============================================================ */
function isPowerNet(n){ return /POWER|HIGH_CURRENT/i.test(n.type||''); }
// An edge participates in layering unless EVERY one of its nets is power/ground/
// high-current — those rails fan out to nearly every block and would otherwise
// flatten the whole hierarchy into two columns. Power-only edges still draw
// normally; they just don't influence what layer a block ends up in.
function isPowerOnlyEdge(e){ return e.nets && e.nets.length>0 && e.nets.every(isPowerNet); }

// Hardware nets routinely form real cycles at the signal level (e.g. a control
// line out and a status line back between the same two blocks). Longest-path
// ranking only makes sense on a DAG — fed a cycle, the pass-cap keeps
// relaxing every node in the cycle upward until it hits the ceiling, so the
// whole strongly-connected component collapses into the last few layers
// instead of spreading out. Standard fix (classic first step of Sugiyama):
// find "back edges" via DFS (edges to a node still on the current recursion
// stack) and exclude just those from ranking — a deterministic depth-first
// walk in alphabetical order, so which edge of a cycle gets called "the
// back edge" is stable across runs.
function findBackEdges(sortedIds, edges){
  const adj = new Map(sortedIds.map(i=>[i,[]]));
  for (const e of edges) adj.get(e.source).push(e.target);
  for (const id of sortedIds) adj.get(id).sort();

  const UNVISITED=0, ON_STACK=1, DONE=2;
  const state = new Map(sortedIds.map(i=>[i,UNVISITED]));
  const back = new Set();
  function dfs(u){
    state.set(u, ON_STACK);
    for (const v of adj.get(u)){
      if (state.get(v)===UNVISITED) dfs(v);
      else if (state.get(v)===ON_STACK) back.add(u+'→'+v);
    }
    state.set(u, DONE);
  }
  for (const id of sortedIds) if (state.get(id)===UNVISITED) dfs(id);
  return back;
}

// Longest-path layering using only "signal" edges (with cycles broken first).
// A node with no signal edges at all (only power/ground links, or no edges
// whatsoever) can't be placed this way, so it falls back to the rounded
// average layer of its neighbors across EVERY edge — or layer 0 if it has no
// neighbors at all.
function computeSignalLayers(sortedIds, edges){
  const signal = edges.filter(e=>!isPowerOnlyEdge(e));
  const hasSignal = new Set();
  for (const e of signal){ hasSignal.add(e.source); hasSignal.add(e.target); }

  const backEdges = findBackEdges(sortedIds, signal);
  const adjSignal = new Map(sortedIds.map(i=>[i,[]]));
  for (const e of signal){
    if (backEdges.has(e.source+'→'+e.target)) continue;
    adjSignal.get(e.source).push(e.target);
  }
  const rank = new Map(sortedIds.map(i=>[i,0]));
  for (let pass=0; pass<sortedIds.length; pass++){
    let changed=false;
    for (const u of sortedIds) for (const v of adjSignal.get(u))
      if (rank.get(v) < rank.get(u)+1 && rank.get(u)+1 < sortedIds.length){ rank.set(v, rank.get(u)+1); changed=true; }
    if (!changed) break;
  }
  const adjAll = new Map(sortedIds.map(i=>[i,[]]));
  for (const e of edges){
    adjAll.get(e.source).push(e.target);
    adjAll.get(e.target).push(e.source);
  }
  for (const id of sortedIds){
    if (hasSignal.has(id)) continue;
    const neigh = adjAll.get(id);
    rank.set(id, neigh.length ? Math.round(neigh.reduce((s,n)=>s+rank.get(n),0)/neigh.length) : 0);
  }
  return rank;
}

// Barycenter crossing reduction: 8 alternating down/up passes. Each pass reorders
// one layer at a time by the average index of its neighbors in the adjacent layer
// that was just fixed (all edges count here — this is purely about untangling the
// drawing, not the hierarchy). A node with no neighbors in the reference layer
// keeps its current slot instead of jumping. Alphabetical tie-break throughout.
function orderLayersByBarycenter(sortedRanks, colsMap, edges){
  const allIds = [].concat(...sortedRanks.map(r=>colsMap.get(r)));
  const neighborsOf = new Map(allIds.map(id=>[id,[]]));
  for (const e of edges){
    if (!neighborsOf.has(e.source) || !neighborsOf.has(e.target)) continue;
    neighborsOf.get(e.source).push(e.target);
    neighborsOf.get(e.target).push(e.source);
  }
  const order = new Map(sortedRanks.map(r=>[r, [...colsMap.get(r)]]));

  function reorder(idx, refIdx){
    const r = sortedRanks[idx], refR = sortedRanks[refIdx];
    const refIndex = new Map(order.get(refR).map((id,i)=>[id,i]));
    const scored = order.get(r).map((id,i)=>{
      const neigh = neighborsOf.get(id).filter(n=>refIndex.has(n));
      const bary = neigh.length ? neigh.reduce((s,n)=>s+refIndex.get(n),0)/neigh.length : i;
      return { id, bary };
    });
    scored.sort((a,b)=> a.bary-b.bary || a.id.localeCompare(b.id));
    order.set(r, scored.map(x=>x.id));
  }

  for (let pass=0; pass<8; pass++){
    if (pass%2===0) for (let i=1;i<sortedRanks.length;i++) reorder(i,i-1);
    else for (let i=sortedRanks.length-2;i>=0;i--) reorder(i,i+1);
  }
  return order;
}

// Closest (least-squares) non-decreasing sequence to `values` — pool-adjacent-
// violators algorithm for 1-D isotonic regression, O(n). Used to fit a column's
// desired Y positions to the minimum-separation constraint without the unfairness
// of a one-directional push (which can cascade one node's overlap into moving
// another node that never needed to).
function poolAdjacentViolators(values){
  const stack = [];
  for (const v of values){
    let block = { sum:v, count:1, avg:v };
    while (stack.length && stack[stack.length-1].avg > block.avg){
      const prev = stack.pop();
      block = { sum:prev.sum+block.sum, count:prev.count+block.count, avg:(prev.sum+block.sum)/(prev.count+block.count) };
    }
    stack.push(block);
  }
  const result = [];
  for (const block of stack) for (let k=0;k<block.count;k++) result.push(block.avg);
  return result;
}

// Nudges every node toward the average Y of its neighbors (any edge, 4 passes) so
// connections end up as horizontal as possible, resolving any resulting overlap
// with the minimum gap. The order within a layer (from the barycenter step) is
// never changed here — only spacing is, via isotonic regression (see below) so
// resolving one node's overlap can't unfairly drag an unrelated node in the same
// column that never needed to move.
function assignYByAverage(sortedRanks, order, edges, heightFn, gap){
  const allIds = [].concat(...sortedRanks.map(r=>order.get(r)));
  const h = new Map(allIds.map(id=>[id, heightFn(id)]));
  const y = new Map();
  for (const r of sortedRanks){
    const col = order.get(r);
    const total = col.reduce((s,id)=>s+h.get(id),0) + gap*Math.max(0,col.length-1);
    let cursor = 420 - total/2;
    for (const id of col){ y.set(id, cursor + h.get(id)/2); cursor += h.get(id)+gap; }
  }

  const neighborsOf = new Map(allIds.map(id=>[id,[]]));
  for (const e of edges){
    if (!neighborsOf.has(e.source) || !neighborsOf.has(e.target)) continue;
    neighborsOf.get(e.source).push(e.target);
    neighborsOf.get(e.target).push(e.source);
  }

  // Move halfway toward the neighbor average each pass rather than snapping to it —
  // an undamped Jacobi update oscillates and can overshoot far past every neighbor
  // for high-degree hubs whose neighbors are themselves moving in the same pass.
  const DAMPING = 0.5;
  const initialCentroid = allIds.reduce((s,id)=>s+y.get(id),0)/allIds.length;
  for (let pass=0; pass<4; pass++){
    const desired = new Map();
    for (const id of allIds){
      const neigh = neighborsOf.get(id);
      const avg = neigh.length ? neigh.reduce((s,n)=>s+y.get(n),0)/neigh.length : y.get(id);
      desired.set(id, y.get(id) + (avg-y.get(id))*DAMPING);
    }
    for (const r of sortedRanks){
      const col = order.get(r);
      if (!col.length) continue;
      // Minimum-separation-preserving fit: de-mean each slot by its cumulative
      // required offset, run isotonic regression (closest non-decreasing sequence,
      // pool-adjacent-violators) on the de-meaned desired values, then add the
      // offsets back. This is the least-displacement solution respecting both the
      // fixed order and the minimum gaps — unlike a one-directional forward push,
      // it never lets one node's collision cascade into shifting an unrelated node
      // that already had room.
      const offsets=[0];
      for (let i=1;i<col.length;i++) offsets.push(offsets[i-1] + h.get(col[i-1])/2+gap+h.get(col[i])/2);
      const z = col.map((id,i)=> desired.get(id)-offsets[i]);
      const zFit = poolAdjacentViolators(z);
      col.forEach((id,i)=> y.set(id, zFit[i]+offsets[i]));
    }
    // Pooling isn't mean-preserving (it can shift a column's average when it stretches
    // to satisfy minimum separation), so without this the whole diagram can drift
    // linearly, pass after pass, in whatever direction the crowding happens to bias it.
    // Re-anchoring the global centroid every pass removes that free-floating degree of
    // freedom while leaving all the RELATIVE repositioning (the actual goal) intact.
    const centroid = allIds.reduce((s,id)=>s+y.get(id),0)/allIds.length;
    const drift = initialCentroid - centroid;
    for (const id of allIds) y.set(id, y.get(id)+drift);
  }

  const pos = new Map();
  for (const id of allIds) pos.set(id, y.get(id) - h.get(id)/2); // center → top-left
  return pos;
}

// heightFn(id) lets each column stack boxes by their real height instead of a
// fixed slot — needed because group blocks grow with their member count.
function layeredLayout(ids, edges, colw, gap, heightFn){
  const sortedIds = [...ids].sort();
  const idSet = new Set(sortedIds);
  const relevant = edges.filter(e=>idSet.has(e.source)&&idSet.has(e.target));

  const rank = computeSignalLayers(sortedIds, relevant);
  const cols = new Map();
  for (const id of sortedIds){
    const r = rank.get(id);
    if (!cols.has(r)) cols.set(r,[]);
    cols.get(r).push(id);
  }
  const sortedRanks = [...cols.keys()].sort((a,b)=>a-b);
  for (const r of sortedRanks) cols.set(r, cols.get(r).sort()); // alphabetical seed order

  const order = orderLayersByBarycenter(sortedRanks, cols, relevant);
  const yOf = assignYByAverage(sortedRanks, order, relevant, heightFn, gap);

  const pos = new Map();
  for (const r of sortedRanks) for (const id of order.get(r))
    pos.set(id, { x: 40 + r*colw, y: yOf.get(id) });
  return pos;
}

function nodeHeight(id){ const n=nodeById(id); return n ? n.h : NODE_H_IC; }

// Lays out one group's members using only that group's internal edges — a local
// diagram scoped to the group, not the whole system (each node belongs to exactly
// one group, so reusing n.x/n.y per node here never conflicts across groups).
function autoLayoutGroupMembers(groupId){
  const g = groupsWithUngrouped().find(x=>x.id===groupId);
  if (!g || !g.members.length) return;
  const memberSet = new Set(g.members);
  const internalEdges = S.edges.filter(e=>memberSet.has(e.source) && memberSet.has(e.target));
  const pos = layeredLayout(g.members, internalEdges, 265, 32, nodeHeight);
  for (const id of g.members){ const n=nodeById(id); if (n){ const p=pos.get(id); n.x=p.x; n.y=p.y; } }
}

function autoLayoutAllGroupMembers(){
  for (const g of groupsWithUngrouped()) autoLayoutGroupMembers(g.id);
}

// onlyMissing=true fills in positions only for groups that don't have one yet
// (used when restoring a session, so manually-dragged group positions survive).
function autoLayoutGroups(onlyMissing){
  const groups = visibleGroups();
  const pos = layeredLayout(groups.map(g=>g.id), computeGroupEdges(), 340, 40,
    id=>groupBlockHeight(groups.find(g=>g.id===id)));
  for (const [id,p] of pos){
    if (onlyMissing && S.groupPos[id]) continue;
    S.groupPos[id] = p;
  }
}

/* ============================================================
   RENDER
   ============================================================ */
function esc(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function nodeById(id){ return S.nodes.find(n=>n.id===id); }
function isHvNetType(n){ return /HIGH_VOLTAGE/i.test(n.type||''); }

/* ------------------------------------------------------------------
   SIGNAL CATEGORIES — every wire and arrowhead renders at the same size
   (see the markerUnits="userSpaceOnUse" markers in index.html); nets are
   told apart by color + dash pattern only, never by weight. An edge that
   bundles several nets of different categories (a bus) draws as the
   highest-priority one it carries, so the wire always surfaces its most
   safety-relevant signal.
   ------------------------------------------------------------------ */
const NET_CATEGORY_STYLE = {
  hv:        { color:'var(--sig-hv)',        dash:null,      marker:'arrowHv' },
  power:     { color:'var(--sig-power)',     dash:null,      marker:'arrowPower' },
  switching: { color:'var(--sig-switching)', dash:'9 3 2 3', marker:'arrowSwitching' },
  control:   { color:'var(--sig-control)',   dash:null,      marker:'arrowControl' },
  logic:     { color:'var(--sig-logic)',     dash:'6 3',     marker:'arrowLogic' },
  analog:    { color:'var(--sig-analog)',    dash:null,      marker:'arrowAnalog' },
  other:     { color:'var(--sig-other)',     dash:'2 3',     marker:'arrowOther' },
};
const CATEGORY_PRIORITY = ['hv','power','switching','control','logic','analog','other'];
function netCategory(n){
  if (isHvNetType(n)) return 'hv';
  const t = (n.type||'').toUpperCase();
  if (t==='POWER_DISTRIBUTION' || t==='HIGH_CURRENT_PATH') return 'power';
  if (t==='SWITCHING_NODE') return 'switching';
  if (t==='CONTROL_SIGNAL') return 'control';
  if (t==='DIGITAL_LOGIC') return 'logic';
  if (t==='ANALOG_SIGNAL' || t==='SENSING_LINE' || t==='FEEDBACK_PATH' || t==='QUIET_REFERENCE') return 'analog';
  return 'other'; // NOISY_NODE, NO_CONNECT, NA
}
function edgeCategory(e){
  const cats = new Set(e.nets.map(netCategory));
  for (const c of CATEGORY_PRIORITY) if (cats.has(c)) return c;
  return 'other';
}
const EDGE_STROKE_W = 2.2, GROUP_EDGE_STROKE_W = 2.6;

/* ------------------------------------------------------------------
   LV / HV SIDE CLASSIFICATION — a block that only ever touches
   HIGH_VOLTAGE_PATH-typed nets sits on the HV side and renders red; one
   that touches both an HV-typed net and an ordinary one straddles the
   isolation barrier and renders half its normal color, half red. This is
   inferred from the net graph (the contract has no explicit domain field
   to read instead) but is overridable per node via n.hvSide, since no
   heuristic gets every real design right.
   ------------------------------------------------------------------ */
function nodeTouchingNets(nodeId){
  const nets = [];
  for (const e of S.edges) if (e.source===nodeId || e.target===nodeId) nets.push(...e.nets);
  return nets;
}
function inferNodeSide(nodeId){
  const nets = nodeTouchingNets(nodeId);
  if (!nets.length) return 'lv';
  const hv = nets.some(isHvNetType), lv = nets.some(n=>!isHvNetType(n));
  return hv && lv ? 'barrier' : hv ? 'hv' : 'lv';
}
function nodeSide(nodeId){
  const n = nodeById(nodeId);
  return (n && n.hvSide) || inferNodeSide(nodeId);
}
// A group is 'hv'/'lv' only if every member agrees; any mix (including a
// group that itself contains a barrier member) reads as a barrier group.
function groupSide(groupId){
  const g = groupsWithUngrouped().find(x=>x.id===groupId);
  if (!g || !g.members.length) return 'lv';
  const sides = new Set(g.members.map(nodeSide));
  return sides.size===1 ? [...sides][0] : 'barrier';
}
function safeId(s){ return String(s).replace(/[^A-Za-z0-9_-]/g,'_'); }
// A translucent red wash over whatever fill the block already has — works
// the same for IC/external/group styling without needing a bespoke "HV
// variant" of every block's color. 'barrier' clips the wash to the right
// half only, so the left half keeps showing the block's original color.
function hvOverlayMarkup(side, w, h, rx, clipId){
  if (side==='hv') return `<rect width="${w}" height="${h}" rx="${rx}" fill="var(--sig-hv)" opacity=".24" style="pointer-events:none"/>`;
  if (side==='barrier') return `
      <clipPath id="${clipId}"><rect width="${w}" height="${h}" rx="${rx}"/></clipPath>
      <rect clip-path="url(#${clipId})" x="${w/2}" y="0" width="${w/2}" height="${h}" fill="var(--sig-hv)" opacity=".3" style="pointer-events:none"/>
      <line x1="${w/2}" y1="2" x2="${w/2}" y2="${h-2}" stroke="var(--sig-hv)" stroke-width="1.3" opacity=".8" style="pointer-events:none"/>`;
  return '';
}
function hvSideTag(side, w){
  if (side==='hv') return `<text x="${w-6}" y="11" text-anchor="end" font-family="var(--mono)" font-size="7.5" font-weight="700" letter-spacing=".04em" fill="var(--sig-hv)" style="pointer-events:none">HV</text>`;
  if (side==='barrier') return `<text x="${w-6}" y="11" text-anchor="end" font-family="var(--mono)" font-size="7.5" font-weight="700" letter-spacing=".04em" fill="var(--sig-hv)" style="pointer-events:none">HV</text>
      <text x="6" y="11" font-family="var(--mono)" font-size="7.5" font-weight="700" letter-spacing=".04em" fill="var(--ink-soft)" style="pointer-events:none">LV</text>`;
  return '';
}

// Orthogonal (horizontal/vertical) elbow routing, schematic-style (LTSpice/Altium)
// instead of a curve. Full shape is 5 segments: out horizontally from the source
// port, vertical jog at bendX, horizontal plateau at bendY, second vertical jog at
// entryX, and a FINAL HORIZONTAL RUN into the target port — so the arrow always
// enters the block perpendicular to its edge, no matter how the wire is rerouted.
// With route=null the plateau sits at y2 and entryX collapses onto bendX, which
// degenerates to the classic 3-segment "Z".
// A manual route={x,y,x2} moves the joints independently:
//   x  → the first vertical segment (drag sideways),
//   y  → the horizontal plateau (drag up/down),
//   x2 → the LAST vertical segment before the block (drag sideways) — i.e. the
//        final approach into the block is user-positionable.
// Same rule for both node-level and group-level edges, since they share this
// geometry. portY1/portY2 override the default mid-edge attachment so each edge
// can get its own dedicated slot on the block edge (see computeEdgePorts).
function elbowGeometry(a, b, route, portY1, portY2){
  const x1 = a.x + a.w, y1 = portY1!=null ? portY1 : a.y + a.h/2;
  const x2 = b.x,       y2 = portY2!=null ? portY2 : b.y + b.h/2;
  const bendX = (route && route.x!=null) ? route.x : (x1+x2)/2;
  const bendY = (route && route.y!=null) ? route.y : y2;
  let entryX = (route && route.x2!=null) ? route.x2 : (bendY===y2 ? bendX : (bendX+x2)/2);
  // Keep a visible final stub so the arrow can always enter horizontally.
  entryX = Math.min(entryX, x2-12);
  return { x1, y1, x2, y2, bendX, bendY, entryX };
}
function elbowPathD(g){
  return `M ${g.x1} ${g.y1} L ${g.bendX} ${g.y1} L ${g.bendX} ${g.bendY} L ${g.entryX} ${g.bendY} L ${g.entryX} ${g.y2} L ${g.x2} ${g.y2}`;
}
function elbowBadgePos(g){ return { x:g.bendX, y:(g.y1+g.bendY)/2 }; }

/* ------------------------------------------------------------------
   OBSTACLE-AVOIDING ROUTING — a wire must never pass in front of a block:
   at a glance there's no way to tell whether it terminates there or just
   runs behind it, which is exactly the ambiguity this is meant to prevent.
   This nudges the plateau (bendY) and both vertical jogs (bendX, entryX) of
   the 5-segment elbow off of every OTHER currently-visible block, by a fixed
   clearance. It runs on every render — including live drags — so a manual
   reroute that lands on a block is nudged clear automatically instead of
   being allowed to overlap; the two short stubs at y1/y2 are left alone,
   since they sit inside the column gap and are clear in practice.
   ------------------------------------------------------------------ */
const ROUTE_CLEARANCE = 9;
function padForRoute(r){ return { x1:r.x-ROUTE_CLEARANCE, y1:r.y-ROUTE_CLEARANCE, x2:r.x+r.w+ROUTE_CLEARANCE, y2:r.y+r.h+ROUTE_CLEARANCE }; }
function hSegHitsRect(y, xa, xb, r){
  const lo=Math.min(xa,xb), hi=Math.max(xa,xb), p=padForRoute(r);
  return y>p.y1 && y<p.y2 && hi>p.x1 && lo<p.x2;
}
function vSegHitsRect(x, ya, yb, r){
  const lo=Math.min(ya,yb), hi=Math.max(ya,yb), p=padForRoute(r);
  return x>p.x1 && x<p.x2 && hi>p.y1 && lo<p.y2;
}
// Nudges `preferred` to the nearer edge of whatever obstacle it clips, then
// re-checks (a crowded diagram can stack more than one obstacle in the same
// corridor) — bails out if it starts bouncing between two obstacles rather
// than looping forever.
function clearHorizontal(preferred, xa, xb, obstacles){
  let y = preferred; const seen = new Set();
  for (let i=0;i<12;i++){
    const hit = obstacles.find(r=>hSegHitsRect(y, xa, xb, r));
    if (!hit) return y;
    const p = padForRoute(hit);
    const cand = Math.abs(p.y1-preferred) <= Math.abs(p.y2-preferred) ? p.y1 : p.y2;
    const key = Math.round(cand);
    if (seen.has(key)) return cand;
    seen.add(key); y = cand;
  }
  return y;
}
function clearVertical(preferred, ya, yb, obstacles){
  let x = preferred; const seen = new Set();
  for (let i=0;i<12;i++){
    const hit = obstacles.find(r=>vSegHitsRect(x, ya, yb, r));
    if (!hit) return x;
    const p = padForRoute(hit);
    const cand = Math.abs(p.x1-preferred) <= Math.abs(p.x2-preferred) ? p.x1 : p.x2;
    const key = Math.round(cand);
    if (seen.has(key)) return cand;
    seen.add(key); x = cand;
  }
  return x;
}
function routeAroundObstacles(geo, obstacles){
  if (!obstacles.length) return geo;
  const { x1,y1,x2,y2 } = geo;
  let { bendX, bendY, entryX } = geo;
  for (let pass=0; pass<4; pass++){
    const nBendY = clearHorizontal(bendY, bendX, entryX, obstacles);
    const nBendX = clearVertical(bendX, y1, nBendY, obstacles);
    const nEntryX = clearVertical(entryX, nBendY, y2, obstacles);
    if (nBendY===bendY && nBendX===bendX && nEntryX===entryX){ bendY=nBendY; bendX=nBendX; entryX=nEntryX; break; }
    bendX=nBendX; bendY=nBendY; entryX=nEntryX;
  }
  entryX = Math.min(entryX, x2-12);
  return { x1,y1,x2,y2,bendX,bendY,entryX };
}
function memberObstacleRects(members){ return members.map(n=>({ id:n.id, x:n.x, y:n.y, w:n.w, h:n.h })); }
function obstaclesExcluding(rects, srcId, tgtId){ return rects.filter(r=>r.id!==srcId && r.id!==tgtId); }

// Invisible wide hit-paths over each draggable wire segment. seg-v (first jog)
// and seg-e (entry jog) move in X; seg-h (plateau) and seg-f (final run into the
// block) move in Y — grabbing the wire right where it enters the block and
// dragging vertically lifts the plateau, and the perpendicular re-entry appears.
function routeHandleMarkup(g, eid, extraAttrs, w){
  return `
      <path class="seg-v" data-eid="${esc(eid)}"${extraAttrs} d="M ${g.bendX} ${g.y1} L ${g.bendX} ${g.bendY}" fill="none" stroke="transparent" stroke-width="${w}" style="cursor:ew-resize"/>
      <path class="seg-h" data-eid="${esc(eid)}"${extraAttrs} d="M ${g.bendX} ${g.bendY} L ${g.entryX} ${g.bendY}" fill="none" stroke="transparent" stroke-width="${w}" style="cursor:ns-resize"/>
      <path class="seg-e" data-eid="${esc(eid)}"${extraAttrs} d="M ${g.entryX} ${g.bendY} L ${g.entryX} ${g.y2}" fill="none" stroke="transparent" stroke-width="${w}" style="cursor:ew-resize"/>
      <path class="seg-f" data-eid="${esc(eid)}"${extraAttrs} d="M ${g.entryX} ${g.y2} L ${g.x2} ${g.y2}" fill="none" stroke="transparent" stroke-width="${w}" style="cursor:ns-resize"/>`;
}

// One dedicated attachment slot per connection (instead of everything piling onto
// the block's mid-edge): a block's outputs — one per distinct consumer edge — are
// stacked down its RIGHT edge in deterministic (target id) order, each drawn as a
// filled dot at the wire start; its inputs get the same treatment on the LEFT
// edge, each arriving as a perpendicular arrow. reserveLinkSlot additionally
// keeps the last right-edge slot free for the crosshair "new connection" port.
// Returned Y values are absolute world coordinates keyed by edge id.
function computeEdgePorts(rectOf, ids, edges, reserveLinkSlot){
  const outs = new Map(ids.map(i=>[i,[]])), ins = new Map(ids.map(i=>[i,[]]));
  for (const e of edges){
    if (outs.has(e.source)) outs.get(e.source).push(e);
    if (ins.has(e.target)) ins.get(e.target).push(e);
  }
  const yOut = new Map(), yIn = new Map(), linkY = new Map();
  for (const id of ids){
    const r = rectOf(id);
    if (!r) continue;
    const o = outs.get(id).sort((a,b)=>(a.target+'|'+a.id).localeCompare(b.target+'|'+b.id));
    const slots = o.length + (reserveLinkSlot ? 1 : 0);
    o.forEach((e,i)=> yOut.set(e.id, r.y + r.h*(i+1)/(slots+1)));
    if (reserveLinkSlot) linkY.set(id, r.y + r.h*slots/(slots+1));
    const inn = ins.get(id).sort((a,b)=>(a.source+'|'+a.id).localeCompare(b.source+'|'+b.id));
    inn.forEach((e,i)=> yIn.set(e.id, r.y + r.h*(i+1)/(inn.length+1)));
  }
  return { yOut, yIn, linkY };
}
let lastPorts = null; // ports of the most recently rendered view (used by renderLink)

function render(){
  viewport.setAttribute('transform', `translate(${S.view.tx},${S.view.ty}) scale(${S.view.k})`);

  if (isTopLevel()) renderTopLevel(); else renderDrillDown();

  renderLink();
  renderBreadcrumb();
  renderInspector();
  renderStatus();
  $('projTitle').textContent = S.meta.title || 'Untitled system';
}

// Boundary-crossing edges for the currently open group, keyed by the neighboring
// group so multiple node-level edges to/from the same group collapse into one
// portal stub. Reuses computeGroupEdges() — same aggregation as the top level.
function openGroupPortals(){
  if (isTopLevel()) return { incoming:[], outgoing:[] };
  const incoming = computeGroupEdges().filter(e=>e.target===S.openGroup)
    .sort((a,b)=>a.source.localeCompare(b.source));
  const outgoing = computeGroupEdges().filter(e=>e.source===S.openGroup)
    .sort((a,b)=>a.target.localeCompare(b.target));
  return { incoming, outgoing };
}

const PORTAL_W = 156, PORTAL_H = 52, PORTAL_GAP = 70, PORTAL_MARGIN = 90;

function portalRect(i, count, dir, memberBounds){
  const y = (memberBounds.minY+memberBounds.maxY)/2 - ((count-1)*PORTAL_GAP)/2 + i*PORTAL_GAP - PORTAL_H/2;
  const x = dir==='in' ? memberBounds.minX - PORTAL_MARGIN - PORTAL_W : memberBounds.maxX + PORTAL_MARGIN;
  return { x, y, w:PORTAL_W, h:PORTAL_H };
}

function memberBounds(members){
  return {
    minX: Math.min(...members.map(n=>n.x)), maxX: Math.max(...members.map(n=>n.x+n.w)),
    minY: Math.min(...members.map(n=>n.y)), maxY: Math.max(...members.map(n=>n.y+n.h))
  };
}

// Drill-down: only the open group's member nodes and their internal edges, plus
// left/right portal stubs for edges that cross the group boundary (read-only —
// open the OTHER group to edit those). All existing node/edge editing below is
// untouched from the pre-groups flat view, just scoped to this member set.
function renderDrillDown(){
  const g = groupsWithUngrouped().find(x=>x.id===S.openGroup);
  const memberSet = new Set(g ? g.members : []);
  const members = S.nodes.filter(n=>memberSet.has(n.id));
  const edges = S.edges.filter(e=>memberSet.has(e.source) && memberSet.has(e.target));
  const bounds = members.length ? memberBounds(members) : { minX:0,maxX:0,minY:0,maxY:0 };
  const { incoming, outgoing } = openGroupPortals();
  // One dedicated slot per connection on each block edge: output dot per target
  // on the right, input arrow per source on the left; the last right-edge slot
  // stays reserved for the crosshair "new connection" port.
  const ports = computeEdgePorts(id=>nodeById(id), members.map(n=>n.id), edges, true);
  lastPorts = ports;
  const obstacleRects = memberObstacleRects(members);

  const edgeMarkup = edges.map(e=>{
    const cat = edgeCategory(e), style = NET_CATEGORY_STYLE[cat];
    const selected = S.sel && S.sel.type==='edge' && S.sel.id===e.id;
    const a = nodeById(e.source), b = nodeById(e.target);
    if (!a||!b) return '';
    const geo = routeAroundObstacles(
      elbowGeometry(a, b, e.route, ports.yOut.get(e.id), ports.yIn.get(e.id)),
      obstaclesExcluding(obstacleRects, e.source, e.target));
    const mid = elbowBadgePos(geo);
    const w = selected ? EDGE_STROKE_W+1.6 : EDGE_STROKE_W;
    return `<g class="edge" data-eid="${esc(e.id)}">
      <path d="${elbowPathD(geo)}" fill="none" stroke="transparent" stroke-width="14" style="cursor:pointer"/>
      <path d="${elbowPathD(geo)}" fill="none" stroke="${style.color}" stroke-width="${w}"
        stroke-dasharray="${selected?'none':(style.dash||'none')}"
        ${selected?'filter="drop-shadow(0 0 3px var(--probe))"':''}
        marker-end="url(#${style.marker})" style="pointer-events:none"/>
      <circle cx="${geo.x1}" cy="${geo.y1}" r="4" fill="${style.color}" style="pointer-events:none"/>
      ${routeHandleMarkup(geo, e.id, '', 12)}
      <g style="pointer-events:none">
        <rect x="${mid.x-13}" y="${mid.y-9}" width="26" height="16" rx="8"
          fill="${selected?'var(--probe)':'var(--paper)'}" stroke="${style.color}" stroke-width="1.2"/>
        <text x="${mid.x}" y="${mid.y+3.5}" text-anchor="middle"
          font-family="var(--mono)" font-size="9.5" fill="var(--ink)">${e.nets.length}</text>
      </g>
    </g>`;
  }).join('');

  const portalMarkup = [
    ...incoming.map((item,i)=>portalMarkupFor(item,'in',i,incoming.length,bounds)),
    ...outgoing.map((item,i)=>portalMarkupFor(item,'out',i,outgoing.length,bounds))
  ].join('');

  edgesG.innerHTML = edgeMarkup + portalMarkup;

  nodesG.innerHTML = members.map(n=>{
    const selected = S.sel && S.sel.type==='node' && S.sel.id===n.id;
    // Link port sits at its reserved (last) right-edge slot so it never overlaps
    // the per-connection output dots. Coordinates inside the <g> are relative.
    const linkCy = (ports.linkY.get(n.id) ?? (n.y + n.h/2)) - n.y;
    const side = nodeSide(n.id);
    if (n.kind==='ic'){
      return `<g class="node" data-nid="${esc(n.id)}" transform="translate(${n.x},${n.y})" style="cursor:move">
        <rect x="-3" y="4" width="${n.w+6}" height="${n.h}" rx="5" fill="#00000018"/>
        <rect width="${n.w}" height="${n.h}" rx="5" fill="var(--epoxy)"
          stroke="${selected?'var(--probe)':(side==='lv'?'var(--epoxy-edge)':'var(--sig-hv)')}" stroke-width="${selected?2.5:1.4}"/>
        ${hvOverlayMarkup(side, n.w, n.h, 5, 'hvclip-'+safeId(n.id))}
        <circle cx="13" cy="13" r="3.6" fill="var(--silk)"/>
        <text x="26" y="26" font-family="var(--mono)" font-size="13.5" font-weight="600" fill="var(--silk)">${esc(n.label)}</text>
        <text x="26" y="44" font-family="var(--sans)" font-size="10" fill="#B9BEC4">${esc((n.data.ic_type||'').slice(0,30))}</text>
        ${hvSideTag(side, n.w)}
        <circle class="port" data-port="${esc(n.id)}" cx="${n.w}" cy="${linkCy}" r="6.5"
          fill="var(--copper-soft)" stroke="var(--copper)" stroke-width="1.6" style="cursor:crosshair"/>
      </g>`;
    }
    return `<g class="node" data-nid="${esc(n.id)}" transform="translate(${n.x},${n.y})" style="cursor:move">
      <rect width="${n.w}" height="${n.h}" rx="4" fill="var(--paper)"
        stroke="${selected?'var(--probe)':(side==='lv'?'var(--ink-soft)':'var(--sig-hv)')}" stroke-width="${selected?2.5:1.4}" stroke-dasharray="${selected?'none':'5 4'}"/>
      ${hvOverlayMarkup(side, n.w, n.h, 4, 'hvclip-'+safeId(n.id))}
      <text x="12" y="20" font-family="var(--mono)" font-size="10" letter-spacing=".08em" fill="var(--ink-soft)">EXTERNAL</text>
      <text x="12" y="36" font-family="var(--sans)" font-size="11.5" font-weight="500" fill="var(--ink)">${esc(n.label.slice(0,26))}</text>
      ${hvSideTag(side, n.w)}
      <circle class="port" data-port="${esc(n.id)}" cx="${n.w}" cy="${linkCy}" r="6"
        fill="var(--copper-soft)" stroke="var(--copper)" stroke-width="1.5" style="cursor:crosshair"/>
    </g>`;
  }).join('');
}

function portalMarkupFor(item, dir, i, count, bounds){
  const r = portalRect(i, count, dir, bounds);
  const otherId = dir==='in' ? item.source : item.target;
  const other = groupsWithUngrouped().find(g=>g.id===otherId);
  const label = other ? other.title : otherId;
  const style = NET_CATEGORY_STYLE[edgeCategory(item)];
  const selected = S.sel && S.sel.type==='portal' && S.sel.id===(dir+':'+otherId);
  const stubY = r.y + r.h/2;
  // dir='in': stub sits left of the members, arrow points right into the group.
  // dir='out': stub sits right of the members, arrow points right away from it.
  const stubLineX1 = dir==='in' ? r.x + r.w : bounds.maxX;
  const stubLineX2 = dir==='in' ? bounds.minX : r.x;
  return `<g class="portal" data-portal="${esc(dir+':'+otherId)}" style="cursor:pointer">
    <path d="M ${stubLineX1} ${stubY} L ${stubLineX2} ${stubY}" fill="none" stroke="${style.color}"
      stroke-width="${EDGE_STROKE_W}" stroke-dasharray="${style.dash||'5 4'}" marker-end="url(#${style.marker})"/>
    <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="6" fill="var(--vellum)"
      stroke="${selected?'var(--probe)':'var(--ink-soft)'}" stroke-width="${selected?2.5:1.5}" stroke-dasharray="4 3"/>
    <text x="${r.x+10}" y="${r.y+18}" font-family="var(--mono)" font-size="9" letter-spacing=".08em" fill="var(--ink-soft)">${dir==='in'?'FROM':'TO'}</text>
    <text x="${r.x+10}" y="${r.y+36}" font-family="var(--mono)" font-size="12" font-weight="600" fill="var(--ink)">${esc(label.slice(0,17))}</text>
    <circle cx="${r.x+r.w-16}" cy="${r.y+r.h/2}" r="9" fill="var(--paper)" stroke="${style.color}" stroke-width="1.2"/>
    <text x="${r.x+r.w-16}" y="${r.y+r.h/2+3.5}" text-anchor="middle" font-family="var(--mono)" font-size="9.5" fill="var(--ink)">${item.nets.length}</text>
  </g>`;
}

// Sheet-symbol style: vellum fill, ink border, mono title, member count.
// Inter-group edges are derived by code from S.edges (see computeGroupEdges) —
// read-only at this level, so group blocks carry no .port (no manual linking here).
function renderTopLevel(){
  const groups = visibleGroups();
  const gEdges = computeGroupEdges();
  // Same per-connection port discipline as the drill-down: one output dot per
  // consumer group on the right edge, one perpendicular input arrow per source
  // group on the left edge. No link slot — group edges are derived, not drawn.
  const ports = computeEdgePorts(id=>groupBlockRect(id), groups.map(g=>g.id), gEdges, false);
  lastPorts = null;
  const obstacleRects = groups.map(g=>groupBlockRect(g.id));

  edgesG.innerHTML = gEdges.map(e=>{
    const cat = edgeCategory(e), style = NET_CATEGORY_STYLE[cat];
    const selected = S.sel && S.sel.type==='groupEdge' && S.sel.id===e.id;
    const a = groupBlockRect(e.source), b = groupBlockRect(e.target);
    const geo = routeAroundObstacles(
      elbowGeometry(a, b, groupEdgeRouteOf(e.source,e.target), ports.yOut.get(e.id), ports.yIn.get(e.id)),
      obstaclesExcluding(obstacleRects, e.source, e.target));
    const mid = elbowBadgePos(geo);
    const w = selected ? GROUP_EDGE_STROKE_W+1.6 : GROUP_EDGE_STROKE_W;
    const segAttrs = ` data-src="${esc(e.source)}" data-tgt="${esc(e.target)}"`;
    return `<g class="edge" data-eid="${esc(e.id)}">
      <path d="${elbowPathD(geo)}" fill="none" stroke="transparent" stroke-width="16" style="cursor:pointer"/>
      <path d="${elbowPathD(geo)}" fill="none" stroke="${style.color}" stroke-width="${w}"
        stroke-dasharray="${selected?'none':(style.dash||'none')}"
        ${selected?'filter="drop-shadow(0 0 3px var(--probe))"':''}
        marker-end="url(#${style.marker})" style="pointer-events:none"/>
      <circle cx="${geo.x1}" cy="${geo.y1}" r="4.5" fill="${style.color}" style="pointer-events:none"/>
      ${routeHandleMarkup(geo, e.id, segAttrs, 14)}
      <g style="pointer-events:none">
        <rect x="${mid.x-15}" y="${mid.y-10}" width="30" height="18" rx="9"
          fill="${selected?'var(--probe)':'var(--paper)'}" stroke="${style.color}" stroke-width="1.4"/>
        <text x="${mid.x}" y="${mid.y+4}" text-anchor="middle"
          font-family="var(--mono)" font-size="10.5" font-weight="600" fill="var(--ink)">${e.nets.length}</text>
      </g>
    </g>`;
  }).join('');

  nodesG.innerHTML = groups.map(g=>{
    const pos = groupPosOf(g.id);
    const h = groupBlockHeight(g);
    const selected = S.sel && S.sel.type==='group' && S.sel.id===g.id;
    const eyebrow = g.id===UNGROUPED_ID ? 'UNASSIGNED' : 'FUNCTIONAL GROUP';
    const memberLines = g.members.map((id,i)=>{
      const n = nodeById(id);
      const label = n ? n.label : id;
      const font = n && n.kind==='ic' ? 'var(--mono)' : 'var(--sans)';
      const style = n && n.kind==='ic' ? '' : ' font-style="italic"';
      return `<text x="14" y="${GROUP_HEAD_H+16+i*GROUP_MEMBER_ROW_H}" font-family="${font}" font-size="10"${style} fill="var(--ink-soft)">${esc(label.slice(0,32))}</text>`;
    }).join('');
    const side = groupSide(g.id);
    return `<g class="node" data-nid="${esc(g.id)}" transform="translate(${pos.x},${pos.y})" style="cursor:move">
      <rect x="-4" y="6" width="${GROUP_W+8}" height="${h}" rx="6" fill="#00000018"/>
      <rect width="${GROUP_W}" height="${h}" rx="6" fill="var(--vellum)"
        stroke="${selected?'var(--probe)':(side==='lv'?'var(--ink)':'var(--sig-hv)')}" stroke-width="${selected?3:2}"/>
      ${hvOverlayMarkup(side, GROUP_W, h, 6, 'hvclip-'+safeId(g.id))}
      <line x1="14" y1="30" x2="${GROUP_W-14}" y2="30" stroke="var(--ink)" stroke-width="1" opacity=".18"/>
      <text x="14" y="20" font-family="var(--mono)" font-size="9.5" letter-spacing=".1em" fill="var(--ink-soft)">${eyebrow}</text>
      <text x="14" y="54" font-family="var(--mono)" font-size="15" font-weight="600" fill="var(--ink)">${esc(g.title.slice(0,26))}</text>
      <text x="14" y="${GROUP_HEAD_H}" font-family="var(--sans)" font-size="11" font-weight="600" fill="var(--ink-soft)">${g.members.length} block${g.members.length===1?'':'s'}</text>
      ${hvSideTag(side, GROUP_W)}
      ${memberLines}
    </g>`;
  }).join('');
}

function renderLink(){
  if (!S.link){ linkG.innerHTML=''; return; }
  const a = nodeById(S.link.fromId);
  const y = (lastPorts && lastPorts.linkY.get(a.id) != null) ? lastPorts.linkY.get(a.id) : a.y + a.h/2;
  linkG.innerHTML = `<path d="M ${a.x+a.w} ${y} L ${S.link.x} ${S.link.y}"
    fill="none" stroke="var(--probe-deep)" stroke-width="2" stroke-dasharray="6 5"/>`;
}

function renderBreadcrumb(){
  const el = $('breadcrumb');
  if (isTopLevel()){ el.innerHTML = `<span class="crumb-current">System</span>`; return; }
  const g = groupsWithUngrouped().find(x=>x.id===S.openGroup);
  el.innerHTML = `<button class="crumb-link" id="crumbSystem">System</button><span class="crumb-sep">/</span><span class="crumb-current">${esc(g?g.title:S.openGroup)}</span>`;
  $('crumbSystem').onclick = closeGroupView;
}

function openGroupView(groupId){
  const g = groupsWithUngrouped().find(x=>x.id===groupId);
  if (!g || !g.members.length) return;
  S.openGroup = groupId;
  S.sel = null;
  render();
  fitView();
}

function closeGroupView(){
  S.openGroup = null;
  S.sel = null;
  render();
  fitView();
}

/* ============================================================
   INSPECTOR
   ============================================================ */
// GROUND is intentionally absent — GND is never drawn in this diagram (see buildGraph),
// so it isn't offered as a choice when adding a net by hand either.
const NET_TYPES = ['POWER_DISTRIBUTION','DIGITAL_LOGIC','ANALOG_SIGNAL','CONTROL_SIGNAL','FEEDBACK_PATH','SENSING_LINE','SWITCHING_NODE','HIGH_VOLTAGE_PATH','HIGH_CURRENT_PATH','QUIET_REFERENCE','NOISY_NODE','NO_CONNECT','NA'];

function allGroupsOptions(currentId){
  return groupsWithUngrouped()
    .map(g=>`<option value="${esc(g.id)}" ${g.id===currentId?'selected':''}>${esc(g.title)}</option>`)
    .join('');
}

function renderInspector(){
  const eye=$('insEyebrow'), title=$('insTitle'), body=$('insBody');
  if (!S.sel){
    eye.textContent='System';
    title.textContent=S.meta.title||'Untitled system';
    const groups = visibleGroups();
    const ungrouped = groups.find(g=>g.id===UNGROUPED_ID);
    const descTruncated = (S.meta.description||'').length > 420;
    body.innerHTML = `
      <p>${esc((S.meta.description||'').slice(0,420))}${descTruncated?'… ':''}${descTruncated?'<button class="linklike" id="btnFullDesc">Read full description</button>':''}</p>
      <div class="kv"><label>Blocks</label><div class="val">${S.nodes.filter(n=>n.kind==='ic').length} ICs · ${S.nodes.filter(n=>n.kind==='external').length} external</div></div>
      <div class="kv"><label>Connections</label><div class="val">${S.edges.length} edges · ${S.edges.reduce((s,e)=>s+e.nets.length,0)} nets</div></div>
      <div class="kv"><label>Groups</label><div class="val">${groups.length} shown${ungrouped&&ungrouped.members.length?` · ${ungrouped.members.length} ungrouped`:''}</div></div>
      <p style="margin-top:14px">${isTopLevel()
        ? 'System-level view — each block is a functional group, derived automatically from the underlying connections. Select a group or a connection to inspect it, or double-click a group to open it. Drag a group to reposition it.'
        : 'Select a block or a connection to inspect it. Drag from a copper port to another block to create a connection. Press <b>Delete</b> to remove the selection. Click "System" above to return to the top level.'}</p>`;
    if (descTruncated) $('btnFullDesc').onclick = () => {
      openModal(S.meta.title||'System description',
        `<p style="white-space:pre-wrap;line-height:1.6">${esc(S.meta.description)}</p>`,
        `<button class="primary" id="mCancel">Close</button>`);
      $('mCancel').onclick = closeModal;
    };
    return;
  }
  if (S.sel.type==='group'){
    const g = visibleGroups().find(x=>x.id===S.sel.id);
    if (!g){ S.sel=null; renderInspector(); return; }
    const isUngrouped = g.id===UNGROUPED_ID;
    eye.textContent = isUngrouped ? 'Ungrouped blocks' : 'Functional group';
    title.textContent = g.title;
    const memberRows = g.members.map(id=>{
      const n = nodeById(id);
      return `<div class="row" style="align-items:center;margin-bottom:6px">
        <div style="font-family:var(--mono);font-size:12px;word-break:break-word">${esc(n?n.label:id)}</div>
        <select data-move-member="${esc(id)}">${allGroupsOptions(g.id)}</select>
      </div>`;
    }).join('') || '<p style="color:var(--ink-soft)">No members.</p>';
    body.innerHTML = `
      ${isUngrouped
        ? `<p>${esc(g.description||'')}</p>`
        : `<div class="kv"><label>Title</label><input type="text" id="gTitle" value="${esc(g.title)}"></div>
           <div class="kv"><label>Description</label><textarea id="gDesc">${esc(g.description)}</textarea></div>`}
      <div class="kv"><label>Members (${g.members.length}) — move to group</label></div>
      ${memberRows}
      <div class="btnrow">
        <button id="btnOpenGroup">Open group</button>
        ${isUngrouped?'':'<button class="danger" id="btnDelGroup">Delete group</button>'}
      </div>
      ${isUngrouped?'':'<p style="margin-top:10px;color:var(--ink-soft);font-size:11.5px">Deleting a group moves its members to Ungrouped — blocks are never deleted.</p>'}`;
    $('btnOpenGroup').onclick=()=>openGroupView(g.id);
    if (!isUngrouped){
      $('gTitle').onchange=()=>{
        const grp=S.groups.find(x=>x.id===g.id);
        if (grp){ grp.title=$('gTitle').value.trim()||grp.title; render(); }
      };
      $('gDesc').onchange=()=>{
        const grp=S.groups.find(x=>x.id===g.id);
        if (grp){ grp.description=$('gDesc').value.trim(); render(); }
      };
      $('btnDelGroup').onclick=()=>{
        S.groups=S.groups.filter(x=>x.id!==g.id);
        delete S.groupPos[g.id];
        Object.keys(S.groupEdgeRoutes).forEach(k=>{ if (k.startsWith(g.id+'→')||k.endsWith('→'+g.id)) delete S.groupEdgeRoutes[k]; });
        S.sel=null; render(); fitView();
      };
    }
    body.querySelectorAll('[data-move-member]').forEach(sel=>{
      sel.onchange=()=>{ moveMemberToGroup(sel.dataset.moveMember, g.id, sel.value); render(); };
    });
    return;
  }
  if (S.sel.type==='groupEdge'){
    const e = computeGroupEdges().find(x=>x.id===S.sel.id);
    if (!e){ S.sel=null; renderInspector(); return; }
    const gs = visibleGroups().find(g=>g.id===e.source), gt = visibleGroups().find(g=>g.id===e.target);
    const hasRoute = !!groupEdgeRouteOf(e.source,e.target);
    eye.textContent='Group connection (read-only)';
    title.textContent = `${gs?gs.title:e.source} → ${gt?gt.title:e.target}`;
    body.innerHTML = `
      <p style="color:var(--ink-soft)">Derived from ${e.nets.length} underlying net${e.nets.length===1?'':'s'} between member blocks. Open a group to edit its individual connections. Drag the vertical segments sideways or the horizontal segments up/down to reroute — including the last segment where the wire enters the block.</p>
      ${e.nets.map(n=>`
        <div class="netcard cat-${netCategory(n)}">
          <div class="nettop"><span class="netname">${esc(n.name)}</span><span class="nettype">${esc(n.type)}</span></div>
          ${n.description?`<div class="netdesc">${esc(n.description)}</div>`:''}
        </div>`).join('')}
      ${hasRoute?'<div class="btnrow"><button id="btnResetRoute">Reset routing</button></div>':''}`;
    const rb=$('btnResetRoute'); if (rb) rb.onclick=()=>{ delete S.groupEdgeRoutes[groupEdgeRouteKey(e.source,e.target)]; render(); };
    return;
  }
  if (S.sel.type==='portal'){
    const [dir, otherId] = S.sel.id.split(/:(.+)/);
    const { incoming, outgoing } = openGroupPortals();
    const e = (dir==='in'?incoming:outgoing).find(x=>(dir==='in'?x.source:x.target)===otherId);
    if (!e){ S.sel=null; renderInspector(); return; }
    const other = groupsWithUngrouped().find(g=>g.id===otherId);
    const here = groupsWithUngrouped().find(g=>g.id===S.openGroup);
    eye.textContent='Portal (read-only)';
    title.textContent = dir==='in'
      ? `${other?other.title:otherId} → ${here?here.title:S.openGroup}`
      : `${here?here.title:S.openGroup} → ${other?other.title:otherId}`;
    body.innerHTML = `
      <p style="color:var(--ink-soft)">This connection leaves the open group. Derived from ${e.nets.length} underlying net${e.nets.length===1?'':'s'}. Open "${esc(other?other.title:otherId)}" to edit it from that side.</p>
      ${e.nets.map(n=>`
        <div class="netcard cat-${netCategory(n)}">
          <div class="nettop"><span class="netname">${esc(n.name)}</span><span class="nettype">${esc(n.type)}</span></div>
          ${n.description?`<div class="netdesc">${esc(n.description)}</div>`:''}
        </div>`).join('')}
      ${other&&other.members.length?`<div class="btnrow"><button id="btnOpenOther">Open "${esc(other.title)}"</button></div>`:''}`;
    const btn = $('btnOpenOther'); if (btn) btn.onclick=()=>openGroupView(otherId);
    return;
  }
  if (S.sel.type==='node'){
    const n = nodeById(S.sel.id);
    if (!n){ S.sel=null; renderInspector(); return; }
    eye.textContent = n.kind==='ic' ? 'Integrated circuit' : 'External block';
    title.textContent = n.label;
    const sideRow = `
      <div class="kv"><label>Voltage domain</label>
        <select id="fSide">
          <option value="" ${!n.hvSide?'selected':''}>Auto (${inferNodeSide(n.id)})</option>
          <option value="lv" ${n.hvSide==='lv'?'selected':''}>Low voltage</option>
          <option value="barrier" ${n.hvSide==='barrier'?'selected':''}>Isolation barrier (half/half)</option>
          <option value="hv" ${n.hvSide==='hv'?'selected':''}>High voltage</option>
        </select>
      </div>`;
    if (n.kind==='ic'){
      body.innerHTML = `
        <div class="kv"><label>Type</label><div class="val">${esc(n.data.ic_type||'')}</div></div>
        <div class="kv"><label>Manufacturer</label><div class="val">${esc(n.data.manufacturer||'—')}</div></div>
        <div class="kv"><label>Function</label><div class="val">${esc(n.data.description||'')}</div></div>
        <div class="kv"><label>Selection rationale</label><div class="val">${esc(n.data.selection_rationale||'')}</div></div>
        <div class="kv"><label>Datasheet</label><div class="val">${n.data.DatasheetUrl?`<a href="${esc(n.data.DatasheetUrl)}" target="_blank" rel="noopener">${esc(n.data.DatasheetUrl)}</a>`:'—'}</div></div>
        ${sideRow}
        <div class="btnrow"><button class="danger" id="btnDelNode">Delete IC and its connections</button></div>`;
    } else {
      body.innerHTML = `
        <div class="kv"><label>Description</label><div class="val">${esc(n.data.description||'')}</div></div>
        ${sideRow}
        <div class="btnrow"><button class="danger" id="btnDelNode">Delete block and its connections</button></div>`;
    }
    $('fSide').onchange=()=>{ n.hvSide = $('fSide').value || undefined; render(); };
    const del=$('btnDelNode'); if (del) del.onclick=()=>deleteNode(n.id);
    return;
  }
  // edge
  const e = S.edges.find(x=>x.id===S.sel.id);
  if (!e){ S.sel=null; renderInspector(); return; }
  eye.textContent='Connection';
  title.textContent = `${nodeById(e.source)?.label||'?'} → ${nodeById(e.target)?.label||'?'}`;
  body.innerHTML = `
    ${e.nets.length?'':'<p style="color:var(--warn)">This connection has no nets yet — add at least one, or it will be dropped on export.</p>'}
    ${e.nets.map((n,i)=>`
      <div class="netcard cat-${netCategory(n)}">
        <div class="nettop">
          <span class="netname">${esc(n.name)}</span>
          <span class="nettype">${esc(n.type)}</span>
          <button class="x" data-delnet="${i}" title="Remove net">✕</button>
        </div>
        ${n.description?`<div class="netdesc">${esc(n.description)}</div>`:''}
      </div>`).join('')}
    <div class="addnet">
      <div class="kv"><label>Net name</label><input type="text" id="newNetName" placeholder="MY_NEW_NET"></div>
      <div class="row">
        <div class="kv"><label>Type</label><select id="newNetType">${NET_TYPES.map(t=>`<option>${t}</option>`).join('')}</select></div>
      </div>
      <div class="kv"><label>Description</label><textarea id="newNetDesc" placeholder="One line: purpose, polarity/tie point if applicable"></textarea></div>
      <button id="btnAddNet">Add net</button>
    </div>
    <p class="hint">Drag the vertical segments sideways or the horizontal segments up/down to reroute — including the last segment where the wire enters the block. The arrow always enters the block perpendicular to its edge.</p>
    <div class="btnrow">
      ${e.route?'<button id="btnResetRoute">Reset routing</button>':''}
      <button class="danger" id="btnDelEdge">Delete connection</button>
    </div>`;
  body.querySelectorAll('[data-delnet]').forEach(b=>b.onclick=()=>{ e.nets.splice(+b.dataset.delnet,1); render(); });
  $('btnAddNet').onclick=()=>{
    const name = $('newNetName').value.trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'');
    if (!name){ toast('Net name required'); return; }
    if (e.nets.some(n=>n.name===name)){ toast('This connection already carries a net with that name'); return; }
    e.nets.push({ name, type:$('newNetType').value, description:$('newNetDesc').value.trim() });
    e.nets.sort((a,b)=>a.name.localeCompare(b.name));
    render();
  };
  const rb=$('btnResetRoute'); if (rb) rb.onclick=()=>{ delete e.route; render(); };
  $('btnDelEdge').onclick=()=>{ S.edges=S.edges.filter(x=>x.id!==e.id); S.sel=null; render(); };
}

function deleteNode(id){
  S.nodes = S.nodes.filter(n=>n.id!==id);
  S.edges = S.edges.filter(e=>e.source!==id && e.target!==id);
  S.groups.forEach(g=>{ g.members = g.members.filter(m=>m!==id); });
  S.sel=null; render();
}

/* ============================================================
   STATUS BAR (live validation)
   ============================================================ */
function renderStatus(){
  const isolated = S.nodes.filter(n => !S.edges.some(e=>e.source===n.id||e.target===n.id));
  const emptyEdges = S.edges.filter(e=>e.nets.length===0);
  const ungrouped = groupsWithUngrouped().find(g=>g.id===UNGROUPED_ID);
  const bits = [];
  bits.push(`<span class="chip"><span class="dot" style="background:var(--copper)"></span>${S.nodes.length} blocks · ${S.edges.length} connections</span>`);
  bits.push(isolated.length
    ? `<span class="chip warn"><span class="dot"></span>${isolated.length} unconnected block${isolated.length>1?'s':''}: ${esc(isolated.slice(0,3).map(n=>n.label).join(', '))}${isolated.length>3?'…':''}</span>`
    : `<span class="chip ok"><span class="dot"></span>all blocks connected</span>`);
  if (emptyEdges.length) bits.push(`<span class="chip warn"><span class="dot"></span>${emptyEdges.length} connection${emptyEdges.length>1?'s':''} without nets</span>`);
  if (ungrouped && ungrouped.members.length) bits.push(`<span class="chip warn"><span class="dot"></span>${ungrouped.members.length} ungrouped block${ungrouped.members.length>1?'s':''}</span>`);
  $('statusBar').innerHTML = bits.join('') + renderLegend();
}

const LEGEND_LABELS = { hv:'HV', power:'Power', control:'Control', logic:'Logic', analog:'Analog/sense', switching:'Switching', other:'Other' };
function renderLegend(){
  const items = CATEGORY_PRIORITY.map(cat=>{
    const style = NET_CATEGORY_STYLE[cat];
    const dash = style.dash ? `border-top-style:dashed;` : '';
    return `<span class="litem"><span class="lswatch" style="border-top-color:${style.color};${dash}"></span>${LEGEND_LABELS[cat]}</span>`;
  }).join('');
  return `<span id="legend">${items}</span>`;
}

/* ============================================================
   POINTER INTERACTIONS (pan / zoom / drag / link / select)
   ============================================================ */
function toWorld(clientX, clientY){
  const r = svg.getBoundingClientRect();
  return { x:(clientX-r.left-S.view.tx)/S.view.k, y:(clientY-r.top-S.view.ty)/S.view.k };
}

let drag = null; // {mode:'pan'|'node'|'link', ...}

// Position accessor for whatever is currently draggable — flat-view nodes
// or, at the top level, group sheet-symbol blocks (backed by S.groupPos).
function blockXY(id){
  if (isTopLevel()){ const p=groupPosOf(id); return { x:p.x, y:p.y }; }
  const n = nodeById(id); return n ? { x:n.x, y:n.y } : { x:0, y:0 };
}

svg.addEventListener('pointerdown', ev=>{
  const segEl = ev.target.closest('.seg-v, .seg-h, .seg-e, .seg-f');
  const port = ev.target.closest('.port');
  const portalEl = ev.target.closest('.portal');
  const nodeEl = ev.target.closest('.node');
  const edgeEl = ev.target.closest('.edge');
  svg.setPointerCapture(ev.pointerId);

  if (segEl){
    const cls = segEl.classList;
    // seg-v → route.x (first jog, drag sideways); seg-e → route.x2 (entry jog,
    // the LAST vertical run before the block, drag sideways); seg-h and seg-f
    // (plateau / final run into the block) → route.y (drag up/down).
    const mode = cls.contains('seg-v') ? 'routeV' : cls.contains('seg-e') ? 'routeE' : 'routeH';
    const topLevel = isTopLevel();
    S.sel = { type: topLevel?'groupEdge':'edge', id: segEl.dataset.eid };
    drag = { mode, eid: segEl.dataset.eid,
      topLevel, src: segEl.dataset.src, tgt: segEl.dataset.tgt };
    render();
    return;
  }
  if (port){
    const w = toWorld(ev.clientX, ev.clientY);
    S.link = { fromId: port.dataset.port, x:w.x, y:w.y };
    drag = { mode:'link' };
    svg.classList.add('linking');
    renderLink();
    return;
  }
  if (portalEl){
    S.sel = { type:'portal', id: portalEl.dataset.portal };
    render();
    return;
  }
  if (nodeEl){
    const id = nodeEl.dataset.nid;
    const pos = blockXY(id);
    const w = toWorld(ev.clientX, ev.clientY);
    drag = { mode:'node', id, dx:w.x-pos.x, dy:w.y-pos.y, moved:false };
    return;
  }
  if (edgeEl){
    S.sel = { type: isTopLevel()?'groupEdge':'edge', id: edgeEl.dataset.eid };
    render();
    return;
  }
  drag = { mode:'pan', sx:ev.clientX, sy:ev.clientY, tx:S.view.tx, ty:S.view.ty, moved:false };
  svg.classList.add('panning');
});

svg.addEventListener('dblclick', ev=>{
  if (!isTopLevel()) return;
  const nodeEl = ev.target.closest('.node');
  if (!nodeEl) return;
  openGroupView(nodeEl.dataset.nid);
});

svg.addEventListener('pointermove', ev=>{
  if (!drag) return;
  if (drag.mode==='pan'){
    const dx=ev.clientX-drag.sx, dy=ev.clientY-drag.sy;
    if (Math.abs(dx)+Math.abs(dy)>3) drag.moved=true;
    S.view.tx=drag.tx+dx; S.view.ty=drag.ty+dy;
    viewport.setAttribute('transform', `translate(${S.view.tx},${S.view.ty}) scale(${S.view.k})`);
    return;
  }
  const w = toWorld(ev.clientX, ev.clientY);
  if (drag.mode==='node'){
    const nx = Math.round((w.x-drag.dx)/8)*8, ny = Math.round((w.y-drag.dy)/8)*8;
    if (isTopLevel()){ const p=groupPosOf(drag.id); p.x=nx; p.y=ny; }
    else { const n=nodeById(drag.id); n.x=nx; n.y=ny; }
    drag.moved=true;
    render();
    return;
  }
  if (drag.mode==='routeV' || drag.mode==='routeH' || drag.mode==='routeE'){
    // Vertical segments only move in X; horizontal segments only move in Y.
    const patch = drag.mode==='routeV' ? { x: Math.round(w.x/8)*8 }
                : drag.mode==='routeE' ? { x2: Math.round(w.x/8)*8 }
                : { y: Math.round(w.y/8)*8 };
    if (drag.topLevel) setGroupEdgeRoute(drag.src, drag.tgt, patch);
    else { const e=S.edges.find(x=>x.id===drag.eid); if (e) e.route = { ...e.route, ...patch }; }
    render();
    return;
  }
  if (drag.mode==='link'){
    S.link.x=w.x; S.link.y=w.y;
    renderLink();
  }
});

svg.addEventListener('pointerup', ev=>{
  if (!drag) return;
  if (drag.mode==='pan'){
    if (!drag.moved){ S.sel=null; render(); }
    svg.classList.remove('panning');
  }
  if (drag.mode==='node' && !drag.moved){
    S.sel={type: isTopLevel()?'group':'node', id:drag.id}; render();
  }
  if (drag.mode==='link'){
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const nodeEl = el && el.closest ? el.closest('.node') : null;
    const toId = nodeEl ? nodeEl.dataset.nid : null;
    const fromId = S.link.fromId;
    S.link=null; svg.classList.remove('linking'); renderLink();
    if (toId && toId!==fromId){
      let e = S.edges.find(x=>x.source===fromId && x.target===toId);
      if (!e){
        e = { id:'e'+(S.edgeSeq++), source:fromId, target:toId, nets:[] };
        S.edges.push(e);
      }
      S.sel={type:'edge', id:e.id};
    }
    render();
  }
  drag=null;
});

svg.addEventListener('wheel', ev=>{
  ev.preventDefault();
  const r = svg.getBoundingClientRect();
  const mx=ev.clientX-r.left, my=ev.clientY-r.top;
  const k0=S.view.k, k1=Math.min(2.4, Math.max(.25, k0*(ev.deltaY<0?1.12:0.89)));
  S.view.tx = mx-(mx-S.view.tx)*(k1/k0);
  S.view.ty = my-(my-S.view.ty)*(k1/k0);
  S.view.k=k1;
  viewport.setAttribute('transform', `translate(${S.view.tx},${S.view.ty}) scale(${S.view.k})`);
},{passive:false});

document.addEventListener('keydown', ev=>{
  if ((ev.key==='Delete'||ev.key==='Backspace') && S.sel && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)){
    // Group / group-edge deletion is read-only at the top level for now (phase d).
    if (S.sel.type==='node'){ ev.preventDefault(); deleteNode(S.sel.id); }
    else if (S.sel.type==='edge'){ ev.preventDefault(); S.edges=S.edges.filter(x=>x.id!==S.sel.id); S.sel=null; render(); }
  }
});

function currentBlocksForBounds(){
  if (isTopLevel()) return visibleGroups().map(g=>groupBlockRect(g.id));
  const g = groupsWithUngrouped().find(x=>x.id===S.openGroup);
  const memberSet = new Set(g ? g.members : []);
  const members = S.nodes.filter(n=>memberSet.has(n.id));
  if (!members.length) return members;
  const bounds = memberBounds(members);
  const { incoming, outgoing } = openGroupPortals();
  const portals = [
    ...incoming.map((item,i)=>portalRect(i, incoming.length, 'in', bounds)),
    ...outgoing.map((item,i)=>portalRect(i, outgoing.length, 'out', bounds))
  ];
  return [...members, ...portals];
}

function fitView(){
  const blocks = currentBlocksForBounds();
  if (!blocks.length) return;
  const minX=Math.min(...blocks.map(n=>n.x)), maxX=Math.max(...blocks.map(n=>n.x+n.w));
  const minY=Math.min(...blocks.map(n=>n.y)), maxY=Math.max(...blocks.map(n=>n.y+n.h));
  const r=svg.getBoundingClientRect(), pad=60;
  const k=Math.min(1.4, Math.min((r.width-2*pad)/(maxX-minX), (r.height-2*pad)/(maxY-minY)));
  S.view.k=Math.max(.25,k);
  S.view.tx=(r.width-(maxX-minX)*S.view.k)/2 - minX*S.view.k;
  S.view.ty=(r.height-(maxY-minY)*S.view.k)/2 - minY*S.view.k;
  render();
}

/* ============================================================
   MODALS: Add IC / Import / Export
   ============================================================ */
function openModal(title, bodyHTML, footHTML){
  $('modalTitle').textContent=title;
  $('modalBody').innerHTML=bodyHTML;
  $('modalFoot').innerHTML=footHTML;
  $('modalOverlay').classList.add('open');
}
function closeModal(){ $('modalOverlay').classList.remove('open'); }
$('modalClose').onclick=closeModal;
$('modalOverlay').addEventListener('pointerdown',ev=>{ if(ev.target===$('modalOverlay')) closeModal(); });

$('btnAddIC').onclick=()=>{
  const openGroup = !isTopLevel() && S.openGroup!==UNGROUPED_ID
    ? S.groups.find(g=>g.id===S.openGroup) : null;
  openModal('Add IC block', `
    <div class="kv"><label>Part number *</label><input type="text" id="fPN" placeholder="TPS7A21"></div>
    <div class="kv"><label>IC type *</label><input type="text" id="fType" placeholder="Low-noise LDO regulator"></div>
    <div class="kv"><label>Manufacturer</label><input type="text" id="fMan" placeholder="TEXAS INSTRUMENTS"></div>
    <div class="kv"><label>Function in this system *</label><textarea id="fDesc"></textarea></div>
    <div class="kv"><label>Selection rationale</label><textarea id="fRat"></textarea></div>
    <div class="kv"><label>Datasheet URL</label><input type="text" id="fUrl" placeholder="https://www.ti.com/lit/ds/symlink/....pdf"></div>
    <p class="hint">The new block appears at the center of the view. ${openGroup
      ? `It will join the open group "${esc(openGroup.title)}".`
      : 'It will be ungrouped — open a group first if it belongs in one.'} Drag from its copper port to wire it, then add the nets on each connection.</p>
  `, `<button id="mCancel">Cancel</button><button class="primary" id="mOk">Add IC</button>`);
  $('mCancel').onclick=closeModal;
  $('mOk').onclick=()=>{
    const pn=$('fPN').value.trim();
    if (!pn || !$('fType').value.trim() || !$('fDesc').value.trim()){ toast('Part number, type and function are required'); return; }
    if (nodeById(pn)){ toast('A block with this part number already exists'); return; }
    const r=svg.getBoundingClientRect();
    const c=toWorld(r.left+r.width/2, r.top+r.height/2);
    S.nodes.push({ id:pn, kind:'ic', label:pn, x:Math.round(c.x/8)*8-NODE_W_IC/2, y:Math.round(c.y/8)*8-NODE_H_IC/2,
      w:NODE_W_IC, h:NODE_H_IC,
      data:{ ic_part_number:pn, ic_type:$('fType').value.trim(), manufacturer:$('fMan').value.trim(),
             description:$('fDesc').value.trim(), selection_rationale:$('fRat').value.trim(),
             DatasheetUrl:$('fUrl').value.trim() } });
    if (openGroup){ openGroup.members.push(pn); openGroup.members.sort(); }
    closeModal(); S.sel={type:'node',id:pn}; render();
  };
};

$('btnImport').onclick=()=>{
  openModal('Import', `
    <div class="tabs"><button class="on" id="tabA">System JSON</button><button id="tabB">Saved session</button></div>
    <div id="paneA">
      <p class="hint">Paste the combined system JSON from your n8n pipeline: <span style="font-family:var(--mono)">{"input":…, "contract":…, "groups":…}</span>. Markdown fences and <span style="font-family:var(--mono)">{"output": "..."}</span> wrappers are handled automatically. A bare legacy input JSON (just <span style="font-family:var(--mono)">ic_components</span>, no contract) is also accepted.</p>
      <div class="kv"><label>System JSON (input + contract + groups)</label><textarea id="impSys"></textarea></div>
    </div>
    <div id="paneB" style="display:none">
      <p class="hint">Paste a session JSON previously saved from Export → Save session (keeps positions and edits).</p>
      <div class="kv"><label>Session JSON</label><textarea id="impSess"></textarea></div>
    </div>
  `, `<button id="mCancel">Cancel</button><button class="primary" id="mOk">Import</button>`);
  let mode='A';
  $('tabA').onclick=()=>{ mode='A'; $('tabA').classList.add('on'); $('tabB').classList.remove('on'); $('paneA').style.display=''; $('paneB').style.display='none'; };
  $('tabB').onclick=()=>{ mode='B'; $('tabB').classList.add('on'); $('tabA').classList.remove('on'); $('paneB').style.display=''; $('paneA').style.display='none'; };
  $('mCancel').onclick=closeModal;
  $('mOk').onclick=()=>{
    try{
      if (mode==='A'){
        const raw = tolerantParse($('impSys').value);
        if (!raw || typeof raw!=='object') throw new Error('Not valid JSON');
        let inp, con, groups;
        if (raw.ic_components){
          // legacy: bare architect INPUT pasted alone, no contract
          inp = raw; con = { global_nets:[], external_blocks:[] }; groups = [];
        } else if (raw.input && raw.input.ic_components){
          inp = raw.input; con = raw.contract || { global_nets:[], external_blocks:[] }; groups = raw.groups || [];
        } else {
          throw new Error('Expected {input, contract, groups} (or a legacy input JSON with ic_components)');
        }
        loadFromContract(inp, con, groups);
      } else {
        const s=tolerantParse($('impSess').value);
        if (!s||!s.nodes||!s.edges) throw new Error('Not a session JSON (nodes/edges missing)');
        S.meta=s.meta||S.meta; S.nodes=s.nodes; S.edges=s.edges; S.groups=s.groups||[];
        S.groupPos = s.groupPos || {}; S.groupEdgeRoutes = s.groupEdgeRoutes || {}; S.openGroup = s.openGroup || null;
        S.edgeSeq = Math.max(0,...S.edges.map(e=>+String(e.id).replace(/^e/,'')||0))+1;
        autoLayoutGroups(true); // fill in positions only for groups the session didn't have (preserves dragged layout)
        S.sel=null; render(); fitView();
      }
      closeModal(); toast('Imported');
    }catch(err){ toast('Import failed: '+err.message); }
  };
};

$('btnExport').onclick=()=>{
  const pipeline = buildPipelineJSON();
  const session = buildSessionJSON();
  const emptyEdges = S.edges.filter(e=>e.nets.length===0).length;
  openModal('Export', `
    ${emptyEdges?`<p class="hint" style="color:var(--warn)">Note: ${emptyEdges} connection(s) without nets will be omitted from the contract.</p>`:''}
    <div class="tabs"><button class="on" id="tabP">Pipeline input</button><button id="tabS">Save session</button></div>
    <div id="paneP">
      <p class="hint">Feed this JSON to <b>Prepare Blocks</b> (it carries <span style="font-family:var(--mono)">global_contract_override</span>, so the Architect agent is skipped).</p>
      <pre class="out" id="outP"></pre>
    </div>
    <div id="paneS" style="display:none">
      <p class="hint">Keeps node positions and all edits — re-import later via Import → Saved session.</p>
      <pre class="out" id="outS"></pre>
    </div>
  `, `<button id="mCopy">Copy</button><button class="primary" id="mDl">Download</button>`);
  const pTxt=JSON.stringify([pipeline],null,2), sTxt=JSON.stringify(session,null,2);
  $('outP').textContent=pTxt; $('outS').textContent=sTxt;
  let mode='P';
  $('tabP').onclick=()=>{ mode='P'; $('tabP').classList.add('on'); $('tabS').classList.remove('on'); $('paneP').style.display=''; $('paneS').style.display='none'; };
  $('tabS').onclick=()=>{ mode='S'; $('tabS').classList.add('on'); $('tabP').classList.remove('on'); $('paneS').style.display=''; $('paneP').style.display='none'; };
  $('mCopy').onclick=()=>{ navigator.clipboard.writeText(mode==='P'?pTxt:sTxt).then(()=>toast('Copied')); };
  $('mDl').onclick=()=>{
    const blob=new Blob([mode==='P'?pTxt:sTxt],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download= mode==='P' ? 'pipeline_input.json' : 'architecture_session.json';
    a.click(); URL.revokeObjectURL(a.href);
  };
};

/* ============================================================
   EXPORT BUILDERS (deterministic: everything sorted)
   ============================================================ */
function buildPipelineJSON(){
  const ic_components = S.nodes.filter(n=>n.kind==='ic')
    .sort((a,b)=>a.id.localeCompare(b.id))
    .map(n=>({ ic_type:n.data.ic_type||'', description:n.data.description||'',
      manufacturer:n.data.manufacturer||'', ic_part_number:n.data.ic_part_number||n.id,
      DatasheetUrl:n.data.DatasheetUrl||'', selection_rationale:n.data.selection_rationale||'' }));

  const refOf = n => n.kind==='external' ? 'external block: '+n.label : n.id;
  const netMap = new Map();
  const sortedEdges=[...S.edges].sort((a,b)=>(a.source+'|'+a.target).localeCompare(b.source+'|'+b.target));
  for (const e of sortedEdges){
    const src=nodeById(e.source), dst=nodeById(e.target);
    if (!src||!dst) continue;
    for (const net of e.nets){
      if (!netMap.has(net.name))
        netMap.set(net.name, { name:net.name, type:net.type||'NA', source:refOf(src), consumers:[], description:net.description||'' });
      const rec=netMap.get(net.name);
      const c=refOf(dst);
      if (!rec.consumers.includes(c)) rec.consumers.push(c);
      if (!rec.description && net.description) rec.description=net.description;
    }
  }
  const global_nets=[...netMap.values()].sort((a,b)=>a.name.localeCompare(b.name));
  global_nets.forEach(n=>n.consumers.sort());
  const external_blocks = S.nodes.filter(n=>n.kind==='external')
    .sort((a,b)=>a.label.localeCompare(b.label))
    .map(n=>({ name:n.label, description:n.data.description||'' }));

  const groups = [...S.groups].sort((a,b)=>a.id.localeCompare(b.id)).map(g=>({
    id:g.id, title:g.title, description:g.description,
    members:g.members.map(id=>{ const n=nodeById(id); return n?refOf(n):null; })
      .filter(Boolean).sort() }));

  return { id:S.meta.id, title:S.meta.title, description:S.meta.description,
    key_references:S.meta.key_references, ic_components,
    global_contract_override: JSON.stringify({ global_nets, external_blocks }, null, 2),
    groups };
}

function buildSessionJSON(){
  return { meta:S.meta,
    nodes:S.nodes.map(n=>({ ...n })),
    edges:S.edges.map(e=>({ ...e, nets:e.nets.map(x=>({ ...x })), route:e.route?{...e.route}:undefined })),
    groups:S.groups.map(g=>({ ...g, members:[...g.members] })),
    groupPos:{ ...S.groupPos },
    groupEdgeRoutes:{ ...S.groupEdgeRoutes },
    openGroup:S.openGroup };
}

/* ============================================================
   LOAD / BOOT
   ============================================================ */
function loadFromContract(input, contract, groups){
  S.meta = { id:input.id||null, title:input.title||'', description:input.description||'', key_references:input.key_references||[] };
  S.edgeSeq=0;
  const g = buildGraph(input, contract||{}, groups||[]);
  S.nodes=g.nodes; S.edges=g.edges; S.groups=g.groups;
  S.groupPos={}; S.groupEdgeRoutes={}; S.openGroup=null; S.sel=null;
  autoLayoutAllGroupMembers();
  autoLayoutGroups();
  render(); fitView();
}

function toast(msg){
  const t=$('toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'),2200);
}

$('btnLayout').onclick=()=>{ if (isTopLevel()) autoLayoutGroups(); else autoLayoutGroupMembers(S.openGroup); render(); fitView(); };
$('btnFit').onclick=fitView;
window.addEventListener('resize', ()=>render());

// Theme is session-only (no localStorage) — index.html seeds the initial value from
// prefers-color-scheme before first paint; this button just flips it at runtime.
function updateThemeButton(){
  const isDark = document.documentElement.dataset.theme==='dark';
  $('btnTheme').textContent = isDark ? 'Light' : 'Dark';
  $('btnTheme').title = isDark ? 'Switch to light theme' : 'Switch to dark theme';
}
$('btnTheme').onclick=()=>{
  document.documentElement.dataset.theme = document.documentElement.dataset.theme==='dark' ? 'light' : 'dark';
  updateThemeButton();
};
updateThemeButton();

if (PRELOADED && PRELOADED.input && PRELOADED.contract){
  loadFromContract(PRELOADED.input, PRELOADED.contract, PRELOADED.groups);
} else {
  render();
}
