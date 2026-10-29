CORE := ../firmware/lib/lumi_core/src
CXXFLAGS ?= -std=c++17 -O1 -g -Wall -Wextra -Werror -fsanitize=address,undefined
SRCS := test_core.cpp $(wildcard $(CORE)/*.cpp)

test: build/test_core
	./build/test_core

build/test_core: $(SRCS) $(wildcard $(CORE)/*.h) ../tools/sim/fake_hal.h
	@mkdir -p build
	$(CXX) $(CXXFLAGS) -I$(CORE) -I../tools/sim $(SRCS) -o $@

clean:
	rm -rf build

.PHONY: test clean
