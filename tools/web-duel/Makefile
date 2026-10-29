# Native build of the website's Boop Pong harness, for its test:
#   make -C tools/web-duel test
# The WebAssembly build is build.sh.
CORE := ../../firmware/lib/lumi_core/src
SRC := duel.cpp $(wildcard $(CORE)/*.cpp)
CXXFLAGS := -std=c++17 -O2 -Wall -Wextra -I$(CORE) -I../sim

test: build/test_duel
	./build/test_duel

build/test_duel: test_duel.cpp $(SRC) $(wildcard $(CORE)/*.h) ../sim/fake_hal.h
	mkdir -p build
	$(CXX) $(CXXFLAGS) -o $@ test_duel.cpp $(SRC)

clean:
	rm -rf build

.PHONY: test clean
