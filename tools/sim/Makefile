CORE := ../../firmware/lib/lumi_core/src
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra
OUT ?= ../../build/sim

$(OUT)/sim: sim.cpp fake_hal.h $(wildcard $(CORE)/*.cpp) $(wildcard $(CORE)/*.h)
	@mkdir -p $(OUT)
	$(CXX) $(CXXFLAGS) -I$(CORE) -I. sim.cpp $(wildcard $(CORE)/*.cpp) -o $@

run: $(OUT)/sim
	$(OUT)/sim $(OUT)

.PHONY: run
