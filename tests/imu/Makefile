# Desktop test of the accelerometer driver (firmware/src/imu.cpp) against
# register models of the LIS2DH12 and MPU-6050:  make -C tests/imu
SRC := ../../firmware/src
build/test_imu: test_imu.cpp $(SRC)/imu.cpp $(SRC)/imu.h fakes/Arduino.h fakes/Wire.h
	mkdir -p build
	$(CXX) -std=c++17 -O1 -g -Wall -Wextra -fsanitize=address,undefined -Ifakes -I$(SRC) -o $@ test_imu.cpp $(SRC)/imu.cpp
	./build/test_imu
.PHONY: clean
clean:
	rm -rf build
